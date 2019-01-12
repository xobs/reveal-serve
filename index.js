const http = require('http');
const Git = require('nodegit');
const express = require('express');
const bodyParser = require('body-parser');
const url = require('url');
const mkdirp = require('mkdirp');
const socket_io = require('socket.io');
const crypto = require('crypto');
const program = require('commander');

const app = express();
const port = 9119;

const server = http.createServer(app);
const io = socket_io(server);

const brown = '\033[33m',
      green = '\033[32m',
      red   = '\033[32m',
      reset = '\033[0m';
const progname = `${brown}reveal-sync:${reset}`

program
    .version('1.0')
    .option('-s, --secret <s>', 'Secret from Git Webhook')
    .option('-p, --port <n>', 'Port to listen to', parseInt)
    .option('-r, --repo-root <root>', 'Root for repo and web stuff')
    .option('-m, --repo-prefix <prefix>', 'Add a URI to an allowed repo prefix', (val, memo) => { memo.push(val) }, [])
    .parse(process.argv);

const default_prefixes = process.env['RV_PREFIXES'] ? process.env['RV_PREFIXES'].split(',') : [ 'https://git.xobs.io/xobs' ];
const config = {
    secret: program.secret || process.env['RV_SECRET'] || null,
    port: program.port || process.env['RV_LISTEN_PORT'] || 9119,
    addr: process.env['RV_LISTEN_ADDR'] || '0.0.0.0',
    repo_root: program.repoRoot || process.env['RV_ROOT'] || 'repo-root',
    repo_prefixes: program.repoPrefix.length ? program.repoPrefix : default_prefixes
};

function update_repo(repo) {
    console.log(`${progname} updating repo ${green}${repo}${reset}`);
    repo.fetch('origin').then(function() {
        repo.setHead('FETCH_HEAD').then(function() {
            console.log(`${progname} checking out origin/master`);
            repo.checkoutBranch('origin/master').then(() => {
                return repo.getReferenceCommit('refs/remotes/origin/master');
            }).catch((e) => {
                console.log(`${progname} ${red}unable to get reference commit`);
                console.log(e);
                console.log(`${reset}`);
            }).then(function (commit) {
                Git.Reset.reset(repo, commit, 3, {});
            }).catch((e) => {
                console.log(`${progname} ${red}unable to check out master${reset}`);
            });
        }).catch((e) => {
            console.log(`${progname} ${red}unable to set head`);
            console.log(e);
            console.log(`${reset}`);
        });
    }).catch((e) => {
        console.log(`${progname} ${red}unable to set origin`);
        console.log(e);
        console.log(`${reset}`);
    });
}

function redeploy_repo(url, path, name) {
    mkdirp.sync(config.repo_root);
    var new_path = path + '/' + name;
    console.log(`${progname} cloning ${green}${url}${reset} into ${green}${new_path}${reset}`);

    var repo = Git.Repository.open(new_path)
        .then(update_repo)
        .catch((e) => {
            console.log(`${progname} unable to update ${green}${url}${reset}, trying clone...`);
            Git.Clone(url, new_path).then(update_repo).catch((e) => {
                console.log(`${progname} ${red}unable to clone:`);
                console.log(e);
                console.log(reset);
            });
        });
}

function webhook(config, req, res) {
    if (req.get('X-GitHub-Event') !== 'push')
        return res.status(200).send('X-GitHub-Event was not "push"');

    const wh = req.body;

    // Ensure the secret is present, and matches
    if (config['secret']) {
        if (!wh['secret'] || config['secret'] !== wh['secret'])
            return res.status(403).send('invalid secret token');
    }

    // Reference the repository node, which must exist
    const repository = wh['repository'];
    if (!repository)
        return res.status(403).send('no repository found');

    // Grab the git repository, if it exists
    const html_url = repository['html_url'];
    if (!html_url)
        return res.status(403).send('no html_url found');

    // Ensure the prefix is one that we recognize
    found_prefix = false;
    config.repo_prefixes.forEach(function(prefix) {
        if (html_url.startsWith(prefix)) {
            found_prefix = true;
        }
    });
    if (!found_prefix)
        return res.status(403).send('prefix does not match');

    // Figure out where to place the repo
    const website_url = url.parse(repository['website']);
    // console.log('website_url: ' + website_url + ', repo: ' + repository['website'] + ', pathname: ' + website_url.pathname);
    if (!website_url || !website_url.pathname)
        return res.status(403).send('missing "website" parameter');

    const path = website_url.pathname.split('/').slice(-1)[0];
    if (!path || path === '.' || path === '..' || path === '')
        return res.status(403).send('"website" parameter is not valid');

    // console.log(`deploying to ${path} at ${config.repo_root} from ${html_url}`);

    redeploy_repo(html_url, config.repo_root, path);
    res.send('Ok');
}

var createHash = function(secret) {
    var cipher = crypto.createCipher('blowfish', secret);
    return(cipher.final('hex'));
};

io.on('connection', (socket) => {
    socket.on('multiplex-statechanged', (data) => {
        if (typeof data.secret == 'undefined' 
                || data.secret == null
                || data.secret === '') {
            console.log(`${progname} no secret specified`);
            return;
        }
        if (createHash(data.secret) === data.socketId) {
            data.secret = null;
            socket.broadcast.emit(data.socketId, data);
            console.log(`${progname} master connected on ${green}${data.socketId}${reset}`);
        }
        else {
            console.log(`${progname} given secret ${red}${data.secret}${reset} doesn't match`);
        }
    });
});

function sendIndex(req, res) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write('<style>body{font-family: sans-serif;}</style><h2>reveal.js multiplex server.</h2><a href="/token">Generate token</a>');
    res.end();
}

app.use(bodyParser.json()); // Parse application/json
app.use(bodyParser.urlencoded({ extended: true })); // Parse application/x-www-form-urlencoded

app.all(/\/\.git/, (req, res) => {
    res.sendStatus(404);
});
app.post('/webhook', (req, res) => { return webhook(config, req, res); });
app.get("/token", (req, res) => {
    var ts = new Date().getTime();
    var rand = Math.floor(Math.random()*9999999);
    var originalSecret = ts.toString() + rand.toString();
    var cipher = crypto.createCipher('blowfish', originalSecret);
    var secret = cipher.final('hex');
    res.send({secret: secret, socketId: createHash(secret)});
});
app.get('/', sendIndex);
app.use(express.static(config.repo_root));
server.listen(config.port, config.addr, () => console.log(`${progname} listening on port ${green}${config.port}${reset}`));

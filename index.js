const http = require('http');
const Git = require('nodegit');
const express = require('express');
const bodyParser = require('body-parser');
const url = require('url');
const mkdirp = require('mkdirp');
const socket_io = require('socket.io');
const crypto = require('crypto');

const app = express();
const port = 9119;

const server = http.createServer(app);
const io = socket_io(server);

const config = {
    secret: '1234',
    port: 9119,
    addr: '0.0.0.0',
    repo_root: 'repo-root',
    repo_prefixes: [
        'https://git.xobs.io/xobs'
    ]
};

function update_repo(repo) {
    console.log('updating repo ' + repo);
    repo.fetch('origin').then(function() {
        console.log('setting head on repo');
        repo.setHead('FETCH_HEAD').then(function() {
            console.log('checking out origin/master');
            repo.checkoutBranch('origin/master').then(() => {
                return repo.getReferenceCommit('refs/remotes/origin/master');
            }).catch((e) => {
                console.log('unable to get reference commit:');
                console.log(e);
            }).then(function (commit) {
                Git.Reset.reset(repo, commit, 3, {});
            }).catch((e) => {
                console.log('couldn\'t check out master');
            });
        }).catch((e) => {
            console.log('Couldn\'t set head:');
            console.log(e);
        });
    }).catch((e) => {
        console.log('couldn\'t fetch origin:');
        console.log(e);
    });
}

function redeploy_repo(url, path, name) {
    mkdirp.sync(config.repo_root);
    var new_path = path + '/' + name;
    console.log(`cloning ${url} into ${new_path} (${path} / ${name})`);

    var repo = Git.Repository.open(new_path)
        .then(update_repo)
        .catch((e) => {
            console.log('unable to update, trying clone: ');
            console.log(e);
            Git.Clone(url, new_path).then(update_repo).catch((e) => {
                console.log('unable to clone:');
                console.log(e);
            });
        });
}

function webhook(config, req, res) {
    if (req.get('X-GitHub-Event') !== 'push')
        return res.status(200).send('X-GitHub-Event was not "push"');

    const wh = req.body;

    // Ensure the secret is present, and matches
    console.log('secret: ' + config['secret'] + ', wh: ' + wh['secret']);
    if (!config['secret'] || !wh['secret'] || config['secret'] !== wh['secret'])
        return res.status(403).send('invalid secret token');

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
    console.log('website_url: ' + website_url + ', repo: ' + repository['website'] + ', pathname: ' + website_url.pathname);
    if (!website_url || !website_url.pathname)
        return res.status(403).send('missing "website" parameter');

    const path = website_url.pathname.split('/').slice(-1)[0];
    if (!path || path === '.' || path === '..' || path === '')
        return res.status(403).send('"website" parameter is not valid');

    console.log(`deploying to ${path} at ${config.repo_root} from ${html_url}`);

    redeploy_repo(html_url, config.repo_root, path);
    res.send('Ok');
}

var createHash = function(secret) {
    var cipher = crypto.createCipher('blowfish', secret);
    return(cipher.final('hex'));
};

const brown = '\033[33m',
      green = '\033[32m',
      reset = '\033[0m';

io.on('connection', (socket) => {
    socket.on('multiplex-statechanged', (data) => {
        if (typeof data.secret == 'undefined' 
                || data.secret == null
                || data.secret === '')
            return;
        if (createHash(data.secret) === data.socketId) {
            data.secret = null;
            socket.broadcast.emit(data.socketId, data);
            console.log(`${brown}reveal.js:${reset} master on ${green}data.socketId${reset}`);
        }
    });
});

app.use(bodyParser.json()); // Parse application/json
app.use(bodyParser.urlencoded({ extended: true })); // Parse application/x-www-form-urlencoded

app.post('/webhook', (req, res) => { return webhook(config, req, res); });
app.get("/token", function(req,res) {
    var ts = new Date().getTime();
    var rand = Math.floor(Math.random()*9999999);
    var origsecret = ts.toString() + rand.toString();
    var cipher = crypto.createCipher('blowfish', origsecret);
    var secret = cipher.final('hex');
    res.send({secret: secret, socketId: createHash(secret)});
});
app.get('/', (req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});

//    var stream = fs.createReadStream('index.html');
//    stream.on('error', (error) => {
        res.write('<style>body{font-family: sans-serif;}</style><h2>reveal.js multiplex server.</h2><a href="/token">Generate token</a>');
        res.end();
//    });
//    stream.on('readable', () => { stream.pipe(res); });
});
app.use(express.static(config.repo_root));
server.listen(config.port, config.addr, () => console.log(`Example app listening on port ${config.port}!`));

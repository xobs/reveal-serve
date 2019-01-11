const Git = require('nodegit');
const express = require('express');
const bodyParser = require('body-parser');
const url = require('url');
const mkdirp = require('mkdirp');

const app = express();
const port = 9119;
const root = 'reveal-root/';

function update_repo(repo) {
    console.log('updating repo ' + repo);
    repo.fetch('origin').then(function() {
        console.log('setting head on repo');
        repo.setHead('FETCH_HEAD').then(function() {
            console.log('checking out origin/master');
            repo.checkoutBranch('origin/master');
        });
    });
}

function redeploy_repo(url, path, name) {
    mkdirp.sync(config.repo_root);
    var new_path = path + '/' + name;
    console.log(`cloning ${url} into ${new_path} (${path} / ${name})`);

    var repo = Git.Repository.open(new_path)
        .then(update_repo)
        .catch(function(e) {
            console.log('Unable to update, trying clone: ');
            console.log(e);
            Git.Clone(url, new_path).then(update_repo).catch(function(e) {
                console.log('Unable to clone:');
                console.log(e);
            });
        });
/*
    let mut new_path = path.to_path_buf();
    new_path.push(name);
    eprintln!("Cloning {} into {:?} ({:?} / {})", url, new_path, path, name);

    let repo = match Repository::open(&new_path) {
        Ok(repo) => repo,
        Err(e) => {
            eprintln!("can't open repo, going to try cloning it: {}", e.description());
            match Repository::clone(url, &new_path) {
                Ok(repo) => repo,
                Err(e) => panic!("failed to clone: {}", e),
            }
        }
    };
    
    repo.find_remote("origin")?.fetch(&["master"], None, None)?;
    repo.set_head("FETCH_HEAD")?;
    repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force().use_theirs(true)))?;

    Ok(())
*/
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

const config = {
    secret: "1234",
    repo_root: "repo-root",
    repo_prefixes: [
        "https://git.xobs.io/xobs"
    ]
};

app.use(bodyParser.json()); // Parse application/json
app.use(bodyParser.urlencoded({ extended: true })); // Parse application/x-www-form-urlencoded

app.post('/webhook', function (req, res) { return webhook(config, req, res); });
app.use(express.static(config.repo_root));
app.listen(port, () => console.log(`Example app listening on port ${port}!`));

const Git = require('nodegit');
const express = require('express');
const bodyParser = require('body-parser');
const url = require('url');

const app = express();
const port = 9119;
const root = 'reveal-root/';

function webhook(config, req, res) {
    if (req.get('X-GitHub-Event') !== 'push')
        return res.status(200).send('X-GitHub-Event was not "push"');

    const wh = req.body;

    // Ensure the secret is present, and matches
    if (!config['secret'] || wh['secret'] || config['secret'] !== wh['secret'])
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
        if (html_url.startsWtih(prefix)) {
            found_prefix = true;
        }
    });
    if (!found_prefix)
        return res.status(403).send('prefix does not match');

    // Figure out where to place the repo
    const website_url = new URL(repository['website']);
    if (!website_url || !website_url.pathname)
        return res.status(403).send('missing "website" parameter');

    const path = website_url.pathname.split('/').slice(-1)[0];
    if (!path || path === '.' || path === '..' || path === '')
        return res.status(403).send('"website" parameter is not valid');

    console.log(`deploying to ${path} at ${config.repo_root} from ${html_url}`);
    res.send('Ok');
}

const config = {
    secret: "1234",
    repo_root: "D:\\Code\\talkserved",
    repo_prefixes: [
        "https://git.xobs.io/xobs"
    ]
};

app.use(bodyParser.json()); // Parse application/json
app.use(bodyParser.urlencoded({ extended: true })); // Parse application/x-www-form-urlencoded

app.post('/webhook', function (req, res) { return webhook(config, req, res); });
app.use(express.static(config.repo_root));
app.listen(port, () => console.log(`Example app listening on port ${port}!`));
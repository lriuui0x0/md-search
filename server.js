let fs = require('fs');
let path = require('path');
let yargs = require('yargs');
let express = require('express');
let https = require('https');
let chokidar = require('chokidar');

let root = yargs.argv._[0];
let port = yargs.argv._[1];
let chain = yargs.argv.chain;
let key = yargs.argv.key;

let walk_dir = (dir, callback) => {
    fs.readdirSync(dir).forEach(filename => {
        let file = path.join(dir, filename);
        if (fs.statSync(file).isDirectory()) {
            walk_dir(file, callback);
        } else {
            callback(file);
        }
    });
};

let lstrip_file = (file, parent) => {
    return path.resolve(file).substring(path.resolve(parent).length + 1);
}

let db = {};
walk_dir(root, file => {
    if (file.endsWith('.md')) {
        let clean_file = lstrip_file(file, root);
        db[clean_file] = true;
    }
});

let watcher = chokidar.watch(path.join(root, '**', '*.md'));
watcher.on('all', (event, file) => {
    let clean_file = lstrip_file(file, root);
    if (event === 'add' || event === 'change') {
        db[clean_file] = true;
    } else if (event === 'unlink') {
        delete db[clean_file];
    }
});

let server = express();
server.get('/_db', (req, res) => {
    res.json(Object.keys(db));
});
server.get('/_file/*', (req, res) => {
    let clean_file = decodeURIComponent(req.path.substring(7));
    let file = path.resolve(path.join(root, clean_file));
    if (fs.existsSync(file) && fs.lstatSync(file).isFile()) {
        res.sendFile(file);
    } else {
        res.status(404);
        res.end();
    }
});
server.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
server.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'icon.png'));
});
server.get('/*', (req, res) => {
    let clean_file = decodeURIComponent(req.path.substring(1));
    if (db[clean_file]) {
        res.sendFile(path.join(__dirname, 'index.html'));
    } else {
        res.redirect(301, '/');
    }
});

if (key && chain) {
    let tls_options = {
        cert: fs.readFileSync(chain),
        key: fs.readFileSync(key),
    };
    https.createServer(tls_options, server).listen(port);
}
else
{
    server.listen(port);
}


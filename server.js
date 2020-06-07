let fs = require('fs');
let path = require('path');
let yargs = require('yargs');
let express = require('express');
let https = require('https');
let matter = require('gray-matter');
let chokidar = require('chokidar');

let root = yargs.argv._[0];
let port = yargs.argv._[1];
let key = yars.argv.k;
let chain = yars.argv.c;

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

let cache = {};
let get_md = file => {
    let front_matter = matter(fs.readFileSync(file)).data;
    let keywords;
    if (front_matter.keywords) {
        if (Array.isArray(front_matter.keywords)) {
            keywords = front_matter.keywords.map(x => x.toString());
        } else {
            keywords = [front_matter.keywords.toString()];
        }
    } else {
        let filename = path.parse(file).base; 
        keywords = [filename.substring(0, filename.length - 3)];
    }
    keywords = keywords.flatMap(x => x.split(/\s+/)).map(x => x.trim());
    return {keywords};
};

walk_dir(root, file => {
    if (file.endsWith('.md')) {
        let clean_file = lstrip_file(file, root);
        cache[clean_file] = get_md(file);
    }
});

let get_db = cache => {
    let db = {};
    Object.entries(cache).forEach(([file, md]) => {
        md.keywords.forEach(keyword => {
            if (!db[keyword]) { db[keyword] = [];
            }
            db[keyword].push(file);
        });
    });
    return db;
};
let db = get_db(cache);

let watcher = chokidar.watch(path.join(root, '**', '*.md'));
watcher.on('all', (event, file) => {
    let clean_file = lstrip_file(file, root);
    if (event === 'add' || event === 'change') {
        cache[clean_file] = get_md(file);
    } else if (event === 'unlink') {
        delete cache[clean_file];
    }
    if (event === 'add' || event === 'change' || event === 'unlink') {
        db = get_db(cache);
    }
});

let server = express();
server.get('/_db', (req, res) => {
    res.json(db);
});
server.get('/_file/*', (req, res) => {
    let clean_file = decodeURIComponent(req.path.substring(7));
    let file = path.join(__dirname, root, clean_file);
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
    if (cache[clean_file]) {
        res.sendFile(path.join(__dirname, 'index.html'));
    } else {
        res.redirect(301, '/');
    }
});

if (key && chain)
{
    let tls_options = {
        key: fs.readFileSync(key),
        cert: fs.readFileSync(chain),
    };
    https.createServer(tls_options, server).listen(port);
}
else
{
    server.listen(port);
}


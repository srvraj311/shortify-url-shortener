const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const db = require('mongoose');
const fs = require('fs')
const cors = require('cors')


const config = JSON.parse(fs.readFileSync('./config.json',).toString())
db.connect(config['mongo_uri'], {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    },
    (err) => {
        if (err) console.log('MongoDB Error : ' + err);
    })

// Pulling routers
const indexRouter = require('./routes/index');
const api_router = require('./routes/api_router')
const Url = require("./Models/Url");

const app = express();

app.use(cors())
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());


// Configuring routers
//app.use('/', indexRouter);
const BAD_REQUEST = "Bad request, Request Body Error"
app.get("/:key", async (req, res, next) => {
    const key = req.params.key
    if(key){
        Url.findOne({short : key}, (err, doc) => {
            if(err) res.status(500).json({error : 'Server Error'})
            else if(!doc) res.status(404).json({error : 'No url found'})
            else res.status(200).redirect(doc.url);

        })
    }else res.status(400).json({error : BAD_REQUEST});
})

app.use('/api', api_router)
app.use(express.static(path.join(__dirname, '/client/dist/client')));
app.get('*', (req, res) => {
    res.sendFile(
        path.resolve(__dirname, "client/dist/client/index.html")
    );
})

module.exports = app;

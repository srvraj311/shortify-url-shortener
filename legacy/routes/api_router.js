const express = require('express');
const router = express.Router();
const Url = require('../Models/Url')
const validator = require('validator');
const Shortener = require('../controller/Shortner');
const Salt = require('../Models/Salt')

/* API */
const BAD_REQUEST = "Bad request, Request Body Error"
const BAD_INPUT = "Bad request, URL provided is not valid"
const generateError = (e) => {
    return  {
        error : e.toString()
    }
}




router.post('/', async function(req, res, next) {
    const url = req.body.url;
    if(url){
        if(validator.isURL(url)){
            const salt = await getSalt();
            const shortener = new Shortener(salt);
            const s_url = shortener.getShortenedUrl();
            let newUrlObj = new Url({
                url : url,
                short : s_url,
            })
            newUrlObj.save();
            res.status(200).json({url : s_url})
        }else{
            res.status(404).json(generateError(BAD_INPUT))
        }
    }else{
        res.status(400).json(generateError(BAD_REQUEST));
    }
});

async function getSalt() {
    let doc = await Salt.findOne({});
    let out = doc.salt
    doc.salt = ++out
    await doc.save();
    return --out;
}

module.exports = router;

const mongoose = require('mongoose')
const Url =  mongoose.model('Url' , {
    url : String,
    short : String,
} , "urls")

module.exports = Url;

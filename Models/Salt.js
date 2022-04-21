const mongoose = require('mongoose')
const Salt =  mongoose.model('Salt' , {
    salt : Number
} , "salt")

module.exports = Salt;

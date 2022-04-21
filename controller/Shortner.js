class Shortener {
    constructor(salt) {
        this._salt = salt
    }

    getShortenedUrl = function(){
        const alphabet = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"];
        let out = 61 + this._salt;
        let arr = out.toString().split('');
        let str = '';
        for(let x of arr){
            str += x + alphabet[Math.floor(Math.random() * 26)];
        }
        return str;
    }
}

module.exports = Shortener;

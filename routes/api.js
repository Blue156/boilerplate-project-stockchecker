'use strict';
const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');

// Verbindung zur MongoDB herstellen
mongoose.connect(process.env.DB);

// Überprüfen Sie die Verbindung
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Verbindungsfehler:'));
db.once('open', () => {
  console.log('Verbindung zur MongoDB hergestellt!');
});

// Erstelle Modell
const { Schema, model } = mongoose;

const stockSchema = new Schema({
  _id: mongoose.Schema.Types.ObjectId,
  stock: String,
  likes: {
    type: Number,
    default: 0
  }
});

const userInformation = new Schema({
  _id: mongoose.Schema.Types.ObjectId,
  ipHash: String
});

const stock = model('Stock', stockSchema);
const user = model('User', userInformation);

module.exports = function (app) {

  app.route('/api/stock-prices').get(async function (req, res){

    const clientIp = req.connection.remoteAddress;
    let stockParam = req.query["stock"];
    const stockLiked = (req.query["like"] === "true");

    // convert to array
    if(typeof stockParam === "string"){
      stockParam = [stockParam];
    }

    stockParam.forEach(await checkIfStockIsAlreadyinDatabase);

    // prüfe, ob der Benutzer schon ein like gegeben hat

    if(stockLiked == true){
      const canUserLikeStock = await checkIfUserIsAlreadyInDatabase(clientIp);
      if(canUserLikeStock) {
        stockParam.forEach(await addLikeToStock);
      }
    } else {
      console.log("Stock wurde nicht geliked");
    }

    if(stockParam.length === 1){
      try {
        const response = await getStockInfoFromExternalApi(stockParam);
        const singleStockEntry = await stock.findOne({ stock: stockParam });
        // {"stockData":{"stock":"GOOG","price":786.90,"likes":1}}
        res.json({"stockData":{"stock":response.data["symbol"],"price":response.data["latestPrice"],"likes":singleStockEntry.likes}});
      } catch (error) {
        res.status(500).send('Fehler beim Abrufen der Daten.', error);
      }
    } else {
      try {
        const firstStock = await getStockInfoFromExternalApi(stockParam[0]);
        const doubleFirstStockEntry = await stock.findOne({ stock: stockParam[0] });
        const secondStock = await getStockInfoFromExternalApi(stockParam[1]);
        const doubleSecondStockEntry = await stock.findOne({ stock: stockParam[1] });
        res.json({
          "stockData":[
            {
              "stock": firstStock.data["symbol"],
              "price": firstStock.data["latestPrice"],
              "rel_likes": doubleFirstStockEntry.likes - doubleSecondStockEntry.likes
            },
            {
              "stock": secondStock.data["symbol"],
              "price": secondStock.data["latestPrice"],
              "rel_likes": doubleSecondStockEntry.likes - doubleFirstStockEntry.likes
            }
          ]
        });
      } catch (error) {
        res.status(500).send('Fehler beim Abrufen der Daten.', error);
      } 
    }
  })   
};

async function getStockInfoFromExternalApi(stockName){
  return axios.get(`https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${stockName}/quote`);
}

async function checkIfStockIsAlreadyinDatabase(stockName) {
  let stockEntry = await stock.findOne({ stock: stockName });
  if(!stockEntry){
    const newStock = new stock({
      _id: new mongoose.Types.ObjectId(),
      stock: stockName
    });
    stockEntry = await newStock.save();
    if(stockEntry){
      console.info("Stock erfolgreich angelegt");
      return stockEntry;
    } else {
      console.error("Stock konnte nicht angelegt werden");
    }
  } else {
    console.log("Stock exestiert bereits");
    return stockEntry;
  }
  return null;
}

async function checkIfUserIsAlreadyInDatabase(clientIp){
  const ipHash = crypto.createHash('sha512').update(clientIp).digest('hex');
  let userEntry = await user.findOne({ ipHash: ipHash });
  if(!userEntry){
    console.log("Der Benutzer hat noch kein like abgegeben, like wird hinzugefügt");
    const newUser = new user({
      _id: new mongoose.Types.ObjectId(),
      ipHash: ipHash
    });
    await newUser.save();
    return true;
  }
  return false;
}

async function addLikeToStock(stockName){
  const stockEntry = await stock.findOne({ stock: stockName });
  stockEntry.likes += 1;
  const updatedStockResult = await stockEntry.save(); // Speichere die Änderungen in der Datenbank
  if(updatedStockResult){
    console.log("Stock wurde aktualisiert");
  } else {
    console.error("Stock konnte nicht aktualisiert werden");
  }
}
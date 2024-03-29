require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const helmet = require("helmet");
const { NODE_ENV } = require("./config");
const fetch = require("node-fetch");
const knex = require("knex");
const { response } = require("express");
const cron = require('node-cron')

const app = express();

const morganOption = NODE_ENV === "production" ? "tiny" : "common";

const knexInstance = knex({
  client: "pg",
  connection: { 
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    }
});

console.log("knex and driver installed correctly");

app.use(morgan(morganOption));
app.use(helmet());
app.use(cors());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

let bearer = "";
let url = "https://api.spotify.com/v1/search?q=tag%3Anew&type=album&limit=50";
let albumDatabase = [];
let artistDatabase = {};
let genreList = [];



async function getToken() {
  const data = { grant_type: "client_credentials" };
  return new Promise((resolve, reject) => {
    fetch(`https://accounts.spotify.com/api/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: process.env.API_TOKEN,
      },
      body: new URLSearchParams(data),
    })
      .then((res) => res.json())
      .then((res) => {
        bearer = "Bearer " + res.access_token;
        resolve();
      });
  });
}

async function createAlbumDatabase(url) {
  return new Promise((resolve, reject) =>
    fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: bearer,
      },
    })
      .then((response) => {
        if (response.status !== 200) {
          if (response.status === 404 || 401) {
            resolve(albumDatabase);
          } else {
            throw `${response.status}: ${response.statusText}`;
          }
        }
        const r = response.json();
        return r;
      })
      .then((responseJson) => {
        for (let i = 0; i < responseJson.albums.items.length; i++) {
          if (responseJson.albums.items[i] != null) {
            albumDatabase.push(responseJson.albums.items[i]);
          }
        }
        if (
          responseJson.albums.next !==
          "https://api.spotify.com/v1/search?query=tag%3Anew&type=album&offset=2000&limit=50"
        ) {
          resolve(createAlbumDatabase(responseJson.albums.next));
        } else {
          resolve();
        }
      })
  );
}

function createArtistStrings(data) {
  let strArr = [];
  let artStr = "";
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    for (const artist in data[i].artists) {
      if (count === 49) {
        artStr += `${data[i].artists[artist].id}`;
        strArr.push(artStr);
        artStr = "";
        count = 0;
      } else {
        artStr += `${data[i].artists[artist].id},`;
        count++;
      }
    }
  }
  return strArr;
}

async function getArtists(data, count = 0) {
  return new Promise((resolve, reject) => {
    fetch(`https://api.spotify.com/v1/artists?ids=${data[count]}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: bearer,
      },
    })
      .then((response) => {
        const r = response.json();
        return r;
      })
      .then((response) => {
        for (let i = 0; i < response.artists.length; i++) {
          if (!artistDatabase.hasOwnProperty(`${response.artists[i].name}`)) {
            artistDatabase[`${response.artists[i].name}`] =
              response.artists[i].genres;
          }
        }

        count++;
        if (count < data.length) {
          resolve(getArtists(data, count));
        } else {
          resolve();
        }
      });
  });
}

function addGenreData() {
  for (let x = 0; x < albumDatabase.length; x++) {
    albumDatabase[x].genres = [];
  }
  for (let i = 0; i < albumDatabase.length; i++) {
    for (const artist in albumDatabase[i].artists) {
      for (const genre in artistDatabase[
        albumDatabase[i].artists[artist].name
      ]) {
        albumDatabase[i].genres.push(
          artistDatabase[albumDatabase[i].artists[artist].name][genre]
        );
      }
    }
  }
}

function createGenreList() {
  for (const artist in artistDatabase) {
    for (let j = 0; j < artistDatabase[artist].length; j++) {
      if (genreList.includes(artistDatabase[artist][j]) == false) {
        genreList.push(artistDatabase[artist][j]);
      }
    }
  }
}

app.get("/", (req, res) => {
  res.send("Running!");
});

app.get("/data", async (req, res) => {
  const { pass } = req.query;
  if (pass == process.env.PASS) {
    albumDatabase = [];
    genreList = [];
    await getToken();
    await createAlbumDatabase(url);
    await getArtists(createArtistStrings(albumDatabase));
    addGenreData();
    createGenreList();
    res.send("got that data");
  } else {
    res.send("incorrect password");
  }
});

app.get("/fill", (req, res) => {
  const { pass } = req.query;
  if (pass == process.env.PASS) {
    knexInstance("album_db")
      .truncate()
      .then((response) => response);

    let sendAlbumDb = JSON.stringify(albumDatabase);
    let sendGenreList = JSON.stringify(genreList);
    knexInstance("album_db")
      .insert({
        album_database: sendAlbumDb,
        genre_list: sendGenreList,
      })
      .then(() => res.send("seeded album_database table with albumData"));
  } else {
    res.send("incorrect password");
  }
});

app.get("/dataAndFill", async (req, res) => {
  const { pass } = req.query;
  if (pass == process.env.PASS) {
    console.log('getting data from spotify API')
    albumDatabase = [];
    genreList = [];
    console.log('awaiting getToken')
    await getToken();
    console.log('awaiting createAlbumDatabase')
    await createAlbumDatabase(url);
    console.log('awaiting getArtists')
    await getArtists(createArtistStrings(albumDatabase));
    addGenreData();
    createGenreList();
    console.log('truncating database')
    knexInstance("album_db")
        .truncate()
        .then((response) => response);

    let sendAlbumDb = JSON.stringify(albumDatabase);
    let sendGenreList = JSON.stringify(genreList);
    console.log('inserting information into database')
    knexInstance("album_db")
        .insert({
          album_database: sendAlbumDb,
          genre_list: sendGenreList,
        }).then((response) => response)
    console.log('finished')
    res.send('database filled with new data')
  } else {
    res.send("incorrect password");
  }
});

app.delete("/empty", (req, res) => {
  const { pass } = req.query;
  if (pass == process.env.PASS) {
    knexInstance("album_db").truncate().then((response) => res.send(response))
  } else {
    res.send("incorrect password");
  }
})

app.get("/output", (req, res) => {
  knexInstance
    .from("album_db")
    .select("*")
    .then((response) => {
      res.send({
        albumDatabase: JSON.parse(response[0].album_database),
        genreList: JSON.parse(response[0].genre_list),
      });
    });
});

app.use(function errorHandler(error, req, res, next) {
  let response;
  if (NODE_ENV === "production") {
    response = { error: { message: "server error" } };
  } else {
    console.error(error);
    response = { message: error.message, error };
  }
  res.status(500).json(response);
});

module.exports = app;

require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const helmet = require("helmet");
const { NODE_ENV } = require("./config");
const fetch = require("node-fetch");

//const NODE_ENV = process.env.NODE_ENV || "development";

const app = express();

const morganOption = NODE_ENV === "production" ? "tiny" : "common";

app.use(morgan(morganOption));
app.use(helmet());
app.use(cors());

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
  await getToken();
  await createAlbumDatabase(url);
  await getArtists(createArtistStrings(albumDatabase));
  addGenreData();
  createGenreList();
  let output = { albumDatabase: albumDatabase, genreList: genreList };
  res.send(output);
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

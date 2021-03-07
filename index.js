const express = require('express');
const cors = require('cors');
const queryString = require('querystring');
const fetch = require('node-fetch');
const exphbs = require('express-handlebars');
const fs = require('fs');
const ytdl = require('ytdl-core');
const ytpl = require('ytpl');
const { stringify } = require('querystring');
require('dotenv').config();

// initiating app object
const app = express();

// client id and secret
my_client_id = process.env.my_client_id
my_client_secret = process.env.my_client_secret
let ACCESS_TOKEN = null
let ACCESS_TOKEN_REFRESH = null

// redirect uri
redirect_uri = "http://localhost:5000/auth"

// adding cors
app.use(cors());

// Body Parser Middleware
app.use(express.json());
app.use(express.urlencoded({ "extended": false }));
app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');

// defining PORT number
const PORT = 5000 || process.env.PORT;

// index routes
app.get("/", async (req, res) => {
    if (ACCESS_TOKEN != null) {
        res.render('form');
    }
    else {
        res.redirect("/login");
    }
});

app.post('/', async (req, res) => {

    var playlistID = "";
    const videos = []
    const songs = []
    let spotifyURI = []

    // getting playlist ID from URL
    await ytpl.getPlaylistID(req.body.playlist)
        .then(resp => {
            playlistID = resp;
        })
        .catch(err => {
            console.log(err)
        })

    // getting URLs of Songs from Playlist
    await ytpl(playlistID)
        .then(playlistData => {
            const items = playlistData.items;
            items.forEach(element => {
                videos.push(element.shortUrl);
            });
        })
        .catch(err => {
            console.log(err);
        })

    // getting Song Name from the YouTube URL of Song
    for (const video of videos) {
        songs.push(await getSongName(video));
    }

    // getting Spotify URI for the Songs from the YouTube Playlist
    for (const song of songs) {
        spotifyURI.push(await getSpotifyURI(song));
    }

    // filteing URI array
    spotifyURI = spotifyURI.filter(x => x);

    // getting UserID
    const userID = await getUserID();
    
    // creating Playlist from the form data that User Submitted
    const spotifyPlaylistID = await createPlaylist(req.body.name, req.body.description, userID);
    
    // adding Songs to created Playlist
    await addSongToPalylist(spotifyPlaylistID, spotifyURI.join(','));

    res.redirect('/');
})

// Get Access Code
app.get('/login', function (req, res) {
    var scopes = 'user-read-private user-read-email playlist-modify-public playlist-modify-private';
    var auth = 'https://accounts.spotify.com/authorize' +
        '?response_type=code' +
        '&client_id=' + my_client_id +
        (scopes ? '&scope=' + encodeURIComponent(scopes) : '') +
        '&redirect_uri=' + encodeURIComponent(redirect_uri);

    // console.log(auth);
    res.redirect(auth);
});

// Authenticate Using the Acess Code
app.get('/auth', async (req, res) => {
    let authorization = Buffer.from(my_client_id + ":" + my_client_secret).toString('base64');
    let data = {
        grant_type: "authorization_code",
        code: req.query.code,
        redirect_uri: redirect_uri,
        client_id: my_client_id,
        client_secret: my_client_secret,
    };

    await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + authorization,
            'Accept': 'application/json'
        },
        body: queryString.stringify(data)

    })
        .then(res => {
            return res.json()
        })
        .then(data => {
            // console.log(data);
            ACCESS_TOKEN = data.access_token;
            ACCESS_TOKEN_REFRESH = data.refresh_token;
            res.redirect("/");
        })
        .catch(err => {
            console.log(err);
        })

});


// Search Artist and Songs
app.get("/search/:id", async (req, res) => {
    let oAUTH = 'Bearer ' + ACCESS_TOKEN
    await fetch(`https://api.spotify.com/v1/search?q=${req.params.id}&type=track`, {
        method: "GET",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': oAUTH,
            'Accept': 'application/json'
        },
    })
        .then(res => {
            return res.json();
        })
        .then(data => {
            console.log(data)
            // console.log(data.tracks.items)
            res.render('search', { data: data.tracks.items });
        })
        .catch(err => {
            console.log(err);
        })
})

// get new ACCESS_TOKEN from REFRESH_TOKEN
async function refreshAccessToken() {
    let authorization = Buffer.from(my_client_id + ":" + my_client_secret).toString('base64');
    let data = {
        grant_type: "refresh_token",
        refresh_token: ACCESS_TOKEN_REFRESH,

    };

    await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + authorization,
            'Accept': 'application/json'
        },
        body: queryString.stringify(data)

    })
        .then(res => {
            return res.json()
        })
        .then(data => {
            console.log(data);
            ACCESS_TOKEN = data.access_token;
            res.redirect("/");
        })
        .catch(err => {
            console.log(err);
        })

}

// Get Song Name
async function getSongName(video) {
    return ytdl.getBasicInfo(video)
        .then(videoData => {
            if (videoData.videoDetails.media.song && videoData.videoDetails.media.artist) {
                const song = String(videoData.videoDetails.media.song + ' ' + videoData.videoDetails.media.artist);
                console.log(song);
                return song;
            }
            return;
        })
        .catch(err => {
            console.log(err);
        })
}

// Get Spotify ID
async function getSpotifyURI(song) {
    let oAUTH = 'Bearer ' + ACCESS_TOKEN
    return fetch(`https://api.spotify.com/v1/search?q=${song}&type=track`, {
        method: "GET",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': oAUTH,
            'Accept': 'application/json'
        },
    })
        .then(res => {
            return res.json();
        })
        .then(data => {
            // console.log(data);
            if (data.tracks.items && ((data.tracks.items).length > 0)) {
                // console.log(data.tracks.items[0].uri)
                return data.tracks.items[0].uri;
            }
            else {

                return;
            }
        })
        .catch(err => {
            console.log(err);
        })
}

// get User ID
async function getUserID() {
    let oAUTH = 'Bearer ' + ACCESS_TOKEN
    return fetch("https://api.spotify.com/v1/me    ", {
        method: "GET",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': oAUTH,
            'Accept': 'application/json'
        },
    })
        .then(res => {
            return res.json();
        })
        .then(data => {
            return data.id;
        })
        .catch(err => {
            console.log(err);
        })
}

// create Playlist
async function createPlaylist(name, description, user) {
    let oAUTH = 'Bearer ' + ACCESS_TOKEN
    let body = {
        name: name,
        description: description,
        public: true
    }
    return fetch(`https://api.spotify.com/v1/users/${user}/playlists`, {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': oAUTH,
            'Accept': 'application/json'
        },
        body: JSON.stringify(body)
    })
        .then(res => {
            return res.json()
        })
        .then(data => {
            console.log(data.id);
            return data.id;
        })
        .catch(err => {
            console.log(err);
        })
}

// add songs to Playlist
async function addSongToPalylist(ID, URIS) {
    let oAUTH = 'Bearer ' + ACCESS_TOKEN
    let body = {
        uris: URIS
    }
    return fetch(`https://api.spotify.com/v1/playlists/${ID}/tracks?${queryString.stringify(body)}`, {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': oAUTH,
            'Accept': 'application/json'
        },
    })
        .then(res => {
            return res.json()
        })
        .then(data => {
            // console.log(data);
            return data.snapshot_id;
        })
        .catch(err => {
            console.log(err);
        })
}


// Body Parser Middleware
app.use(express.json());
app.use(express.urlencoded({ "extended": false }));


app.listen(PORT, () => {
    console.log("Server Running at PORT " + PORT);
})
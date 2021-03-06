// server.js
// where your node app starts

const owner = 'foodoasisla';
const repo = 'site';
const getGitHubApp = require('github-app');
const bodyParser = require('body-parser');
const yaml = require('js-yaml');
const requestPromise = require('request-promise-native');

const githubApp = getGitHubApp({
  // Your app id 
  id: process.env.APP_ID,
  // The private key for your app, which can be downloaded from the 
  // app's settings: https://github.com/settings/apps 
  cert: process.env.PRIVATE_KEY.replace(/\\n/g, '\n')
});


// Set up a GitHub app
var github;
githubApp.asInstallation(process.env.APP_INSTALLATION).then(gh => {
  github = gh;
});

/*
// To find out the installation ID (APP_INSTALLATION)
githubApp.asApp().then(github => {
  console.log("Installations:")
  github.integrations.getInstallations({}).then(console.log);
});
*/

// init project
var express = require('express');
var app = express();

// we've started you off with Express, 
// but feel free to use whatever libs or frameworks you'd like through `package.json`.

// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", function (request, response) {
  response.sendFile(__dirname + '/views/index.html');
});

// could also use the POST body instead of query string: http://expressjs.com/en/api.html#req.body
app.post("/add", addLocation);
app.post("/edit", editLocation);

function editLocation (request, response) {
  console.log("got an edit request!");
  const originalLocationUrl = 'https://foodoasis.la' + request.body.url;
  console.log(originalLocationUrl);

  const title = request.body.title;
  const locationCategory = request.body.category;
  
  // Create a branch
  var branchName = `location-${Math.random().toString(36).substr(2,5)}`;

  // Create a unique file within that branch
  let folderName = 'locations';
  if (locationCategory && locationCategory != '') {
    folderName = String(locationCategory.replace(/[^a-z0-9]/gi, '-').toLowerCase());
  }

  // SHIM: Use the “locations” folder if this an unknown category
  if (folderName != 'food-pantry' && folderName != 'community-garden' && folderName != 'farmers-market' && folderName != 'supermarket') {
    folderName = 'locations';
  }
  
  let filename = '_' + folderName + '/' + title.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.md';

  let latitude = '';
  let longitude = '';

  let addressArray = [
    request.body.address_1,
    request.body.address_2,
    request.body.city,
    'California',
    request.body.zip
  ];
  
  let addressForGeocoding = addressArray.join(' ');

  // FOLA’s Mapbox Access Token
  const MAP_ACCESS_TOKEN = 'pk.eyJ1IjoiZm9vZG9hc2lzbGEiLCJhIjoiY2l0ZjdudnN4MDhpYzJvbXlpb3IyOHg2OSJ9.POBdqXF5EIsGwfEzCm8Y3Q';

  const MAPBOX_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' + encodeURIComponent(addressForGeocoding) + '.json';

  // Get the latitude and longitude
  let geocode = requestPromise({
      uri: MAPBOX_URL,
      qs: {
        limit: '1',
        access_token: MAP_ACCESS_TOKEN
      },
      headers: {
          'User-Agent': 'Request-Promise'
      },
      json: true // Automatically parses the JSON string in the response 
  }).then(mapboxResponse => {
    return {
      longitude: mapboxResponse.features[0].center[0],
      latitude: mapboxResponse.features[0].center[1]
    }
  }).catch(error => {
    console.log(error);
    return {
      longitude: '',
      latitude: ''
    }
  });

  // Get hash of the current commit
  let githubRef = github.gitdata.getReference({
    owner: owner,
    repo: repo,
    ref: 'heads/master'
  }).then(result => {
    // And then create a new branch
    return github.gitdata.createReference({
      owner: owner,
      repo: repo,
      ref: `refs/heads/${branchName}`,
      sha: result.data.object.sha
    });
  });
  
  // And then create the file
  Promise.all([geocode, githubRef]).then(result => {

    //console.dir(result);

    latitude = result[0].latitude;
    longitude = result[0].longitude;    
    
    let data = request.body;

    // https://www.npmjs.com/package/js-yaml#safedump-object---options-
    let content =
`---
${yaml.safeDump(request.body)}
latitude: ${latitude}
longitude: ${longitude}
---
`
    content = new Buffer(content).toString('base64');

    return github.repos.createFile({
      owner: owner,
      repo: repo,
      path: filename,
      branch: branchName,
      content: content,
      message: `Edited a location: ${filename}`
    })
  }).then(result => {
    return github.pullRequests.create({
      owner: owner,
      repo: repo,
      title: `${request.body.contributor_name} edited a location: ${title}`,
      head: branchName,
      base: 'master',
      body: `${request.body.contributor_name} edited location at ${originalLocationUrl}`
    })
  })
  .then(result => {
    //console.dir(result);
    console.log('result.data.html_url: ' + result.data.html_url);
    response.redirect(
      `${originalLocationUrl}?pr_link=${result.data.html_url}`
    );
  }).catch(error => {
    console.log(error);
    response.redirect('https://foodoasis.la/add-error');
  });
  
  
  // Send contributor name to Slack bot
  requestPromise({
    uri: 'https://food-oasis-slack.glitch.me/',
    qs: {
      contributor_name: request.body.contributor_name
    },
    headers: {
        'User-Agent': 'Request-Promise'
    },
    json: true // Automatically parses the JSON string in the response 
  }).then(result => {
    console.log("Slack bot result: \n" + result);
  });
  
  

  // Create a pull request

  //dreams.push(request.query.dream);
  //response.sendStatus(200);
}


function addLocation (request, response) {
  const title = request.body.title;
  const locationCategory = request.body.category;
  
  // Create a branch
  var branchName = `location-${Math.random().toString(36).substr(2,5)}`;

  
  // Create a unique file within that branch
  let folderName = 'locations';
  if (locationCategory && locationCategory != '') {
    folderName = String(locationCategory.replace(/[^a-z0-9]/gi, '-').toLowerCase());
  }

  // SHIM: Use the “locations” folder if this an unknown category
  if (folderName != 'food-pantry' && folderName != 'community-garden' && folderName != 'farmers-market' && folderName != 'supermarket') {
    folderName = 'locations';
  }
  
  let filename = '_' + folderName + '/' + title.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.md';


  let latitude = '';
  let longitude = '';

  let addressArray = [
    request.body.address_1,
    request.body.address_2,
    request.body.city,
    'California',
    request.body.zip
  ];
  
  let addressForGeocoding = addressArray.join(' ');

  // FOLA’s Mapbox Access Token
  const MAP_ACCESS_TOKEN = 'pk.eyJ1IjoiZm9vZG9hc2lzbGEiLCJhIjoiY2l0ZjdudnN4MDhpYzJvbXlpb3IyOHg2OSJ9.POBdqXF5EIsGwfEzCm8Y3Q';

  const MAPBOX_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' + encodeURIComponent(addressForGeocoding) + '.json';

  // Get the latitude and longitude
  let geocode = requestPromise({
      uri: MAPBOX_URL,
      qs: {
        limit: '1',
        access_token: MAP_ACCESS_TOKEN
      },
      headers: {
          'User-Agent': 'Request-Promise'
      },
      json: true // Automatically parses the JSON string in the response 
  }).then(mapboxResponse => {
    return {
      longitude: mapboxResponse.features[0].center[0],
      latitude: mapboxResponse.features[0].center[1]
    }
  }).catch(error => {
    console.log(error);
    return {
      longitude: '',
      latitude: ''
    }
  });

  // Get hash of the current commit
  let githubRef = github.gitdata.getReference({
    owner: owner,
    repo: repo,
    ref: 'heads/master'
  }).then(result => {
    // And then create a new branch
    return github.gitdata.createReference({
      owner: owner,
      repo: repo,
      ref: `refs/heads/${branchName}`,
      sha: result.data.object.sha
    });
  });
  
  // And then create the file
  Promise.all([geocode, githubRef]).then(result => {

    //console.dir(result);

    latitude = result[0].latitude;
    longitude = result[0].longitude;    
    
    let data = request.body;

    // https://www.npmjs.com/package/js-yaml#safedump-object---options-
    let content =
`---
${yaml.safeDump(request.body)}
latitude: ${latitude}
longitude: ${longitude}
---
`
    content = new Buffer(content).toString('base64');

    return github.repos.createFile({
      owner: owner,
      repo: repo,
      path: filename,
      branch: branchName,
      content: content,
      message: `Added a new file: ${filename}`
    })
  }).then(result => {
    return github.pullRequests.create({
      owner: owner,
      repo: repo,
      title: `${request.body.contributor_name} suggested a new location: ${title}`,
      head: branchName,
      base: 'master',
      body: null
    })
  }).then(result => {
    //console.dir(result);
    console.log('result.data.html_url: ' + result.data.html_url);
    response.redirect(
      `https://foodoasis.la/add-confirmation?pr_link=${result.data.html_url}`
    );
  }).catch(error => {
    console.log(error);
    response.redirect('https://foodoasis.la/add-error');
  });

  // Create a pull request

  //dreams.push(request.query.dream);
  //response.sendStatus(200);
}

// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});


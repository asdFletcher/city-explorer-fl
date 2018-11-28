'use strict';

// Application Dependencies
const express = require('express');
const superagent = require('superagent');
const cors = require('cors');
const pg = require('pg');

// Load environment variables from .env file
require('dotenv').config();

// Database configuration
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', (err) => console.error(err));
// console.log('client: ', client);
// console.log('~~~~~~~~~');
// let test = client.query('SELECT * FROM locations')
//   .then( (response) => console.log(response));
// console.log(test);
console.log('~~~~~~~~~');


// Application Setup
const app = express();
const PORT = process.env.PORT;
app.use(cors());

// API Routes
app.get('/location', getLocation);

app.get('/weather', getWeather);

app.get('/yelp', getRestaurant);

app.get('/movies', getMovies);

app.get('/meetups', getMeetups);

app.get('/trails', getTrails);

// Make sure the server is listening for requests
app.listen(PORT, () => console.log(`Listening on ${PORT}`));

// Error handler
function handleError(err, res) {
  if (res) res.status(500).send('Sorry, something went wrong');
}

// Models
function Location(query, res) {
  this.table_name = 'locations';
  this.search_query = query;
  this.formatted_query = res.body.results[0].formatted_address;
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
  this.created_at = Date.now();
  // console.log(this);
}

Location.table_name = 'locations';

Location.lookupLocation = (location) => {

  // console.log('location params: ', location);
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`;
  // const SQL = `SELECT * FROM $1 WHERE search_query=$2;`;
  // const values = [Location.table_name, location.query];
  const values = [location.query];
  // console.log('values: ', values);
  // console.log('SQL: ', SQL);

  client.query(SQL, values)
    .then( (dbResponse) => {
      // console.log('dbResponse: ', dbResponse);
      if (dbResponse.rowsCount > 0){
        console.log('dbResponse.rowsCount > 0: ', dbResponse.rowsCount > 0);
        location.cacheHit(dbResponse);
      } else {
        console.log('no rows detected, in the else statement');
        location.cacheMiss();
      }
    })
    .catch(console.error);
}

Location.prototype = {
  save: function() {
    // query , formatted query, lat, long
    // const SQL = `INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id;`;
    console.log('saving the data');
    const SQL = `INSERT INTO locations(search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4);`
    const values = [this.search_query, this.formatted_query, this.latitude, this.longitude];
    // console.log('SQL: ', SQL);
    // console.log('values: ', values);
    return client.query(SQL, values)
      .then( (result) => {
        console.log('result after inserting: ', result);
        console.log('this: ', this);
        console.log('result.rows: ', result.rows);
        console.log('result.rows[0]: ', result.rows[0]);
        // this.id = result.rows[0].id;
        // console.log('this: ', this);
        return this;
      })
  }
}

function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
}

function Yelp(restaurant) {
  this.name = restaurant.name;
  this.image_url = restaurant.image_url;
  this.price = restaurant.price;
  this.rating = restaurant.rating;
  this.url = restaurant.url;
}

function Movie(movieDBData) {
  this.title = movieDBData.title;
  this.overview = movieDBData.overview;
  this.average_votes = movieDBData.vote_average;
  this.total_votes = movieDBData.vote_count;

  //handle null paths
  if (movieDBData.poster_path === null){
    this.image_url = 'https://via.placeholder.com/150';
  } else {
    this.image_url = `http://image.tmdb.org/t/p/w185//${movieDBData.poster_path}`;
  }

  this.popularity = movieDBData.popularity;
  this.released_on = movieDBData.release_date;
}

function Meetup(meetupAPIData) {
  this.link = meetupAPIData.link;
  this.name = meetupAPIData.name;

  if (meetupAPIData.created === undefined){
    this.creation_date = meetupAPIData.created = "Hidden";
  } else {
    let tempDate = new Date(meetupAPIData.created);
    this.creation_date = tempDate.toLocaleDateString("en-US", {weekday: "short", year: "numeric", month:"short", day:"numeric", hour:"numeric"});
  }
  this.host = meetupAPIData.group.name;
}

function Trail(trailObj) {
  this.name = trailObj.name;
  this.location = trailObj.location;
  this.length = trailObj.length;
  this.stars = trailObj.stars;
  this.star_votes = trailObj.starVotes;
  this.summary = trailObj.summary;
  this.trail_url = trailObj.url;
  this.conditions = trailObj.conditionStatus;

  if (trailObj.conditionStatus === 'Unknown'){
    this.condition_date = 'n/a';
    this.condition_time = 'n/a';
  } else {
    let date = new Date(trailObj.conditionDate);
    this.condition_date = date.toDateString()
    this.condition_time = date.toTimeString()
  }
}

// Helper Functions
function getLocation(request, response) {
  console.log('location route hit');
  // console.log('query: ', query); // Seattle

  Location.lookupLocation({
    tableName: Location.table_name,

    query: request.query.data,

    cacheHit: function(result) {
      response.send(result.rows[0]);
    },

    cacheMiss: function(){
      console.log('making a google maps API call')
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${this.query}&key=${process.env.GEOCODE_API_KEY}`;
      superagent.get(url)
        .then((res) => {
          const location = new Location(this.query, res);
          console.log('our new location: ', location);
          location.save()
            .then((location) => {
              console.log('test');
              return response.send(location);
            });
        })
        .catch(error => handleError(error));
    }
  });
}

// function searchToLatLong(query) {
//   console.log('making lat/long API request');
//   const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
//   return superagent.get(url)
//     .then((res) => {
//       return new Location(query, res);
//     })
//     .catch(error => handleError(error));
// }

function getWeather(request, response) {
  // console.log('weather route hit');
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;
  superagent.get(url)
    .then((result) => {
      response.send( result.body.daily.data.map( (day) => new Weather(day)) );
    })
    .catch(error => handleError(error, response));
}

function getRestaurant(request, response) { 
  // console.log('restaurant route hit');
  const url = `https://api.yelp.com/v3/businesses/search?term=restaurants&latitude=${request.query.data.latitude}&longitude=${request.query.data.longitude}`;
  superagent.get(url)
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then((yelp_API_response) =>  { 
      response.send( yelp_API_response.body.businesses.map(restaurant => new Yelp(restaurant)) )
    })
    .catch(error => handleError(error, response));
}

function getMovies(request, response) {
  // console.log('movies route hit');
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&include_adult=false&include_video=false&query=${request.query.data.search_query}`;
  superagent.get(url)
    .then((tmdbResponse) => {
      response.send( tmdbResponse.body.results.map( (tmdbData) => new Movie(tmdbData)) );
    })
    .catch( (error) => handleError(error, response));
}

function getMeetups(request, response) {
  // console.log('meetups route hit');
  const url = `https://api.meetup.com/find/upcoming_events?lat=${request.query.data.latitude}&lon=${request.query.data.longitude}&key=${process.env.MEETUPS_API_KEY}&sign=true`;
  superagent.get(url)
    .then( (res) => {
      const meetupsArray = res.body.events.map( (rawEventData) => {
        return new Meetup(rawEventData);
      } );
      response.send( meetupsArray );
    })
    .catch( (error) => handleError(error, response) );
}

function getTrails(request, response) {
  // console.log('trails route hit');
  const url = `https://www.hikingproject.com/data/get-trails?lat=${request.query.data.latitude}&lon=${request.query.data.longitude}&maxDistance=10&key=${process.env.TRAILS_API_KEY}`;
  superagent.get(url)
    .then( (trailAPIData) => {
      response.send( trailAPIData.body.trails.map( (trailObj) => new Trail(trailObj)));
    })
    .catch( (error) => handleError(error, response));
}




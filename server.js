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
}

Location.table_name = 'locations';

Location.lookupLocation = (location) => {
  // console.log(`checking the database for ${location.query}`);
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`;
  const values = [location.query];
  client.query(SQL, values)
    .then( (dbResponse) => {
      if (dbResponse.rowCount > 0){
        // console.log('cache hit location');
        location.cacheHit(dbResponse, location.response);
      } else {
        // console.log('cache miss location');
        location.cacheMiss(location.response);
      }
    })
    .catch(console.error);
}

Location.prototype = {
  save: function() {
    console.log('saving the data');
    // console.log('this.formatted_query: ', this.formatted_query);
    const SQL = `INSERT INTO locations(search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id;`;
    const values = [this.search_query, this.formatted_query, this.latitude, this.longitude];
    // console.log(`SQL: ${SQL}, Values: ${values}`);
    return client.query(SQL, values)
      .then( (result) => {
        this.id = result.rows[0].id;
        // console.log('this from prototype save: ', this);
        return this;
      })
  }
}

Location.cacheHit = function(result, response) {
  response.send(result.rows[0]);
}

Location.cacheMiss = function(response) {
  console.log('making a google maps API call')
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${this.query}&key=${process.env.GEOCODE_API_KEY}`;
  superagent.get(url)
    .then((res) => {
      const location = new Location(this.query, res); // new Location from API data
      console.log('our new location: ', location);
      location.save()
        .then((location) => {
          return response.send(location);
        });
    })
    .catch(error => handleError(error));
}

function Weather(day) {
  this.tableName = 'weathers';
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
  this.created_at = Date.now();
}

Weather.tableName = 'weathers';
Weather.lookup = lookup;
Weather.deleteByLocationId = deleteByLocationId;

Weather.prototype = {
  save: function(location_id){
    // save data
    // console.log('saving weather data');
    const SQL = `INSERT INTO ${this.tableName} (forecast, time, created_at, location_id) VALUES ($1, $2, $3, $4);`;
    const values = [this.forecast , this.time , this.created_at, location_id];
    client.query(SQL, values).catch( (err) => handleError(err));
  }
}

function Yelp(restaurant) {
  this.tableName = 'restaurants';
  this.name = restaurant.name;
  this.image_url = restaurant.image_url;
  if (restaurant.price === undefined){
    this.price = 'unavailable'
  } else {
    this.price = restaurant.price;
  }
  this.rating = restaurant.rating;
  this.url = restaurant.url;
  this.created_at = Date.now();
}
Yelp.tableName = 'restaurants';
Yelp.lookup = lookup;

Yelp.prototype = {
  save: function(location_id){
    // console.log('saving the restaurant to db')
    const SQL = `INSERT INTO ${this.tableName} (name, image_url, price, rating, url, created_at, location_id) VALUES ($1, $2, $3, $4, $5, $6, $7);`;
    const values = [this.name, this.image_url, this.price, this.rating, this.url, this.created_at, location_id];
    // console.log(`SQL: ${SQL}, Values: ${values}`);
    client.query(SQL, values)
      .catch( (err) => handleError(err));
  }
}

function Movie(movieDBData) {
  this.tableName = 'movies';
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
  this.created_at = Date.now();
}
Movie.tableName = 'movies';
Movie.lookup = lookup;

Movie.prototype.save = function(location_id) {
  // console.log('saving the movie to db');
  const SQL = `INSERT INTO ${this.tableName} (title, overview, average_votes, total_votes, image_url, popularity, released_on, created_at, location_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`;
  const values = [this.title, this.overview, this.average_votes, this.total_votes, this.image_url, this.popularity, this.released_on, this.created_at, location_id];
  // console.log(`SQL: ${SQL}, Values: ${values}`);
  client.query(SQL, values)
    .catch( (err) => handleError(err));
}

function Meetup(meetupAPIData) {
  this.tableName = 'meetups';
  this.link = meetupAPIData.link;
  this.name = meetupAPIData.name;

  if (meetupAPIData.created === undefined){
    this.creation_date = meetupAPIData.created = "Hidden";
  } else {
    let tempDate = new Date(meetupAPIData.created);
    this.creation_date = tempDate.toLocaleDateString("en-US", {weekday: "short", year: "numeric", month:"short", day:"numeric", hour:"numeric"});
  }
  this.host = meetupAPIData.group.name;
  this.created_at = Date.now();
}
Meetup.tableName = 'meetups';
Meetup.lookup = lookup;

Meetup.prototype.save = function(location_id) {
  console.log('in the meetup save');
  const SQL = `INSERT INTO ${this.tableName} (link, name, creation_date, host, created_at, location_id) VALUES ($1, $2, $3, $4, $5, $6);`;
  const values = [this.link, this.name, this.creation_date, this.host, this.created_at, location_id];
  // console.log(`SQL: ${SQL}, Values: ${values}`);
  client.query(SQL, values)
    .catch( (err) => handleError(err));
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
  this.created_at = Date.now();
}

// Helper Functions
function getLocation(request, response) {
  // console.log('location route hit');
  // console.log('query: ', request.query.data); // Seattle

  Location.lookupLocation({
    tableName:  Location.table_name,
    query:      request.query.data,
    cacheHit:   Location.cacheHit,
    cacheMiss:  Location.cacheMiss,
    request:    request,
    response:   response,
  });
}

function getWeather(request, response) {
  // console.log(`Weather route hit, location ID is: ${request.query.data.id}`);
  Weather.lookup({
    location: request.query.data.id,
    tableName: Weather.tableName,
    cacheHit: function(dbResult) {
      // check if valid
      let ageOfResultsInMinutes = (Date.now() - dbResult.rows[0].created_at) / (1000 * 60);
      if (ageOfResultsInMinutes > 30){
        // remove stale data
        // console.log(`detected old weather data, age: ${ageOfResultsInMinutes}`);
        deleteByLocationId(Weather.tableName, request.query.data.id);
        // add new data
        this.cacheMiss();
      } else {
        // data is valid, send to client
        // console.log('fresh weather data, sending data to user')
        response.send(dbResult.rows);
      }
    },
    cacheMiss: function() {
      // get the data
      // console.log('making weather API request');
      const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;
      return superagent.get(url)
        .then( (result) => {
          // make and save all the new weathers
          const allWeathers =  result.body.daily.data.map( (day) => {
            const weather = new Weather(day) // create new weather objects
            weather.save(request.query.data.id); // save it, over-writing old data
            return weather;
          });
          // console.log('sending weather to client');
          response.send(allWeathers); // send it to the client
        })
        .catch(error => handleError(error));
    }
  });
}

function getRestaurant(request, response) {
  // console.log('restaurant route hit');
  Yelp.lookup({
    location: request.query.data.id,
    tableName: Yelp.tableName,
    cacheHit: function(dbResult){
      // console.log('inside the restaurant data cache hit function, db result:', dbResult.rows[0]);
      let ageInDays = (Date.now() - dbResult.rows[0].created_at) / (1000 * 60 * 60 * 24 * 1);
      // console.log('age of restaurants: ', ageInDays) ;
      if (ageInDays > 1){
        // console.log('detected stale restaurant data');
        deleteByLocationId(Yelp.tableName, request.query.data.id);
        this.cacheMiss();
      } else {
        // console.log('sending cached restaurant data to client');
        response.send(dbResult.rows);
      }
    },
    cacheMiss: function(){
      // console.log('in the restaurants miss function')
      const url = `https://api.yelp.com/v3/businesses/search?term=restaurants&latitude=${request.query.data.latitude}&longitude=${request.query.data.longitude}`;
      superagent.get(url)
        .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
        .then((yelp_API_response) => {
          let allRestaurants = yelp_API_response.body.businesses.map( (restaurant) => {
            const newYelp = new Yelp(restaurant);
            newYelp.save(request.query.data.id); // save to database
            return newYelp;
          });
          response.send(allRestaurants); // send to user
        })
        .catch(error => handleError(error, response));
    },
  });
}

function getMovies(request, response) {
  // console.log('movies route hit');
  Movie.lookup({
    location: request.query.data.id,
    tableName: Movie.tableName,
    cacheHit: function(dbResult){
      // console.log('in the movies hit function');
      let ageInDays = (Date.now() - dbResult.rows[0].created_at) / (1000 * 60 * 60 * 24 * 1);
      // console.log('age of movies: ', ageInDays) ;
      if (ageInDays > 1){
        // console.log('detected stale movie data');
        deleteByLocationId(Movie.tableName, request.query.data.id);
        this.cacheMiss();
      } else {
        // console.log('sending movie cache data to client');
        response.send(dbResult.rows);
      }
    },
    cacheMiss: function(){
      // console.log('in the movies miss function');
      const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&include_adult=false&include_video=false&query=${request.query.data.search_query}`;
      superagent.get(url)
        .set('Authorization', `Bearer ${process.env.TMDB_API_KEY}`)
        .then((tmdbResponse) => {
          let allMovies = tmdbResponse.body.results.map( (tmdbData) => {
            const newMovie = new Movie(tmdbData);
            newMovie.save(request.query.data.id); // save to database
            return newMovie;
          });
          response.send(allMovies); // send to user
        })
        .catch(error => handleError(error, response));
    },
  });
}

function getMeetups(request, response) {
  // console.log('meetups route hit');
  Meetup.lookup({
    location: request.query.data.id,
    tableName: Meetup.tableName,
    cacheHit: function(dbResult){
      // console.log('in the Meetups hit function');
      let ageInHours = (Date.now() - dbResult.rows[0].created_at) / (1000 * 60 * 60);
      console.log('age of Meetups: ', ageInHours) ;
      if (ageInHours > 1){
        // console.log('detected stale meetup data');
        deleteByLocationId(Meetup.tableName, request.query.data.id);
        this.cacheMiss();
      } else {
        // console.log('sending meetup cache data to client');
        response.send(dbResult.rows);
      }
    },
    cacheMiss: function(){
      // console.log('in the meetups miss function');
      const url = `https://api.meetup.com/find/upcoming_events?lat=${request.query.data.latitude}&lon=${request.query.data.longitude}&key=${process.env.MEETUPS_API_KEY}&sign=true`;
      superagent.get(url)
        .then((res) => {
          let allMeetups = res.body.events.map( (rawEventData) => {
            const newMeetup = new Meetup(rawEventData)
            newMeetup.save(request.query.data.id); // save to database
            return newMeetup;
          });
          response.send(allMeetups); // send to user
        })
        .catch(error => handleError(error, response));
    },
  });


  // const url = `https://api.meetup.com/find/upcoming_events?lat=${request.query.data.latitude}&lon=${request.query.data.longitude}&key=${process.env.MEETUPS_API_KEY}&sign=true`;
  // superagent.get(url)
  //   .then( (res) => {
  //     const meetupsArray = res.body.events.map( (rawEventData) => {
  //       return new Meetup(rawEventData);
  //     } );
  //     response.send( meetupsArray );
  //   })
  //   .catch( (error) => handleError(error, response) );
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

function lookup(options) {
  console.log(`looking up data from: ${options.tableName} route`);
  const SQL = `SELECT * from ${options.tableName} WHERE location_id=$1`;
  const values = [options.location];
  console.log(`SQL: ${SQL} values: ${values}`);
  client.query(SQL, values)
    .then( (response) => {
      if (response.rowCount > 0){
        // cache hit
        console.log(`cache hit ${options.tableName}`)
        options.cacheHit(response);
      } else {
        // cache miss
        console.log(`cache miss ${options.tableName}`)
        options.cacheMiss();
      }
    })
    .catch( (err) => handleError(err));
}

function deleteByLocationId(table, city){
  //sql delete
  console.log(`deleting a table entry: ${city} from ${table}`);
  const SQL = `DELETE from ${table} WHERE location_id=${city}`;
  const response = client.query(SQL);
  // console.log(`response: ${response}`);
  return response;
}


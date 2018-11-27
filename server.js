'use strict';

// console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');

// Application Dependencies
const express = require('express');
const superagent = require('superagent');
const cors = require('cors');

// Load environment variables from .env file
require('dotenv').config();

// Application Setup
const app = express();
const PORT = process.env.PORT;
app.use(cors());

// API Routes
app.get('/location', (request, response) => {
  // console.log('location route hit');
  searchToLatLong(request.query.data)
    .then(location => { 
      // console.log('this is our location', location);
      return response.send(location)
    })
    .catch(error => handleError(error, response));
})

app.get('/weather', getWeather);

app.get('/yelp', getRestaurant);

app.get('/movies', getMovies);

app.get('/meetups', getMeetups);

// Make sure the server is listening for requests
app.listen(PORT, () => console.log(`Listening on ${PORT}`));

// Error handler
function handleError(err, res) {
  // console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}

// Models
function Location(query, res) {
  this.search_query = query;
  this.formatted_query = res.body.results[0].formatted_address;
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
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
  this.image_url = `http://image.tmdb.org/t/p/w185//${movieDBData.poster_path}`;
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

// Helper Functions
function searchToLatLong(query) {
  // console.log('location route hit');
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
  return superagent.get(url)
    .then((res) => {
      return new Location(query, res);
    })
    .catch(error => handleError(error));
}

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

'use strict';

console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');

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
  console.log('location route hit');
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
  // console.log('~~~   ~~~   ~~~   ~~~');
  // console.log(movieDBData);
  this.title = movieDBData.title; //
  this.overview = movieDBData.overview; //
  this.average_votes = movieDBData.vote_average; //
  this.total_votes = movieDBData.vote_count; //
  this.image_url = movieDBData.poster_path; //
  this.popularity = movieDBData.popularity; //
  this.released_on = movieDBData.release_date; //
}

// Helper Functions
function searchToLatLong(query) {
  // console.log('this is our query', query);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
  // console.log('this is the google maps url', url);
  return superagent.get(url)
    .then((res) => {
      return new Location(query, res);
    })
    .catch(error => handleError(error));
}

function getWeather(request, response) {
  console.log('weather route hit');
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;
  superagent.get(url)
    .then((result) => {
      const weatherSummaries = result.body.daily.data.map(day => {
        return new Weather(day);
      });
      // console.log('this is the weather', weatherSummaries);

      response.send(weatherSummaries);
    })
    .catch(error => handleError(error, response));
}

function getRestaurant(request, response) { 
  console.log('restaurant route hit')
  const url = `https://api.yelp.com/v3/businesses/search?term=restaurants&latitude=${request.query.data.latitude}&longitude=${request.query.data.longitude}`;
  superagent.get(url)
            .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
            .then((yelp_API_response) =>  { 
              // console.log('getting stuff');
              const yelpSummaries = yelp_API_response.body.businesses.map(restaurant => {
                return new Yelp(restaurant);
              });
              // console.log('new rest', yelp_API_response);
              response.send(yelpSummaries);
              // console.log('summaries', yelpSummaries);
            })
            .catch(error => handleError(error, response));
}

function getMovies(request, response) {
  console.log('movies route hit');
  // console.log('request.query.data.search_query: ', request.query.data.search_query);
  // console.log('process.env.TMDB_API_KEY: ', process.env.TMDB_API_KEY);
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&include_adult=false&include_video=false&query=${request.query.data.search_query}`;
  console.log(`movies url: ${url}`);
  superagent.get(url)
            .then((tmdbResponse) => {
              // console.log('#################   ###################')
              // console.log(tmdbResponse.body.results)
              response.send (tmdbResponse.body.results.map( (tmdbData) => new Movie(tmdbData)));
            })
            .catch(error => handleError(error, response));
}

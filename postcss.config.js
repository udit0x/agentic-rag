const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');

module.exports = {
  from: undefined,
  plugins: [
    require('postcss-import')(),
    require('tailwindcss')(),
    require('autoprefixer')()
  ]
};
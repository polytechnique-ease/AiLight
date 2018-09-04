/**
 * Ai-Thinker RGBW Light Firmware
 *
 * This file is part of the Ai-Thinker RGBW Light Firmware.
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 *
 * Created by Sacha Telgenhof <me at sachatelgenhof dot com>
 * (https://www.sachatelgenhof.nl)
 * Copyright (c) 2016 - 2018 Sacha Telgenhof
 */

const fs = require('fs');
const exec = require('child_process').exec;
const gulp = require('gulp');
const del = require('del');
const plumber = require('gulp-plumber');
const htmlmin = require('gulp-htmlmin');
const cleancss = require('gulp-clean-css');
const gzip = require('gulp-gzip');
const inline = require('gulp-inline');
const sass = require('gulp-sass');
const favicon = require('gulp-base64-favicon');
const cssBase64 = require('gulp-css-base64');

const uglifyjs = require('uglify-es');
const composer = require('gulp-uglify/composer');
const minify = composer(uglifyjs, console);

const sourceFolder = 'src/';
const targetFolder = 'html/';

// Clean the generated output files
gulp.task('clean', function () {
  del([sourceFolder + 'html.*']);
  del([sourceFolder + '*.html']);
  del([targetFolder + '*.css']);
  return true;
});

// Build the C++ include header file
gulp.task('build', ['html'], function () {
  var source = sourceFolder + 'index.html.gz';
  var destination = sourceFolder + 'html.gz.h';

  var ws = fs.createWriteStream(destination);

  ws.on('error', function (err) {
    console.log(err);
  });

  var data = fs.readFileSync(source);

  ws.write('#define html_gz_len ' + data.length + '\n');
  ws.write('const uint8_t html_gz[] PROGMEM = {');

  for (i = 0; i < data.length; i++) {
    if (i % 1000 === 0) ws.write('\n');
    ws.write('0x' + ('00' + data[i].toString(16)).slice(-2));
    if (i < data.length - 1) ws.write(',');
  }

  ws.write('\n};');
  ws.end();

  // Remove intermediate files
  fs.unlinkSync(source);
  fs.unlinkSync(targetFolder + 'style.css');
});

// Convert the SCSS to CSS
gulp.task('sass', function () {
  return gulp.src(targetFolder + 'style.scss')
    .pipe(plumber())
    .pipe(sass().on('error', sass.logError))
    .pipe(gulp.dest('html'));
});

// Base 64
gulp.task('css', ['sass'], function () {
  return gulp.src(targetFolder + 'style.css')
    .pipe(cssBase64())
    .pipe(gulp.dest('html'));
});

// Process HTML files
gulp.task('html', ['clean', 'css'], function () {
  return gulp.src(targetFolder + '*.html')
    .pipe(favicon())
    .pipe(inline({
      js: function () {
        return minify({
          mangle: true
        });
      },
      css: [cleancss],
      disabledTypes: ['svg']
    }))
    .pipe(htmlmin({
      collapseWhitespace: true,
      removeComments: true,
      removeEmptyAttributes: true,
      includeAutoGeneratedTags: false,
      minifyCSS: true,
      minifyJS: true
    }))
    .pipe(gzip())
    .pipe(gulp.dest(sourceFolder));
});

// Creates a gamma correction table
// Copy the contents of this file in the lib/AiLight/AiLight.hpp file
gulp.task('gamma', function () {
  var gamma = 2.8; // Correction factor
  var MAX_IN = 255; // Tope end of INPUT range
  var MAX_OUT = 255; // Tope end of OUTPUT range
  var destination = 'gamma.h';

  var ws = fs.createWriteStream(destination);

  ws.on('error', function (err) {
    console.log(err);
  });

  ws.write('// This table remaps linear input values to nonlinear gamma-corrected output\n');
  ws.write('// values. The output values are specified for 8-bit colours with a gamma\n');
  ws.write('// correction factor of 2.8\n');
  ws.write('const static uint8_t PROGMEM gamma8[256] = {');
  for (var i = 0; i <= MAX_IN; i++) {
    if (i > 0) {
      ws.write(',');
    }

    if ((i & 15) === 0) {
      ws.write('\n');
    }

    var level = (Math.floor(Math.pow(i / MAX_IN, gamma) * MAX_OUT + 0.5));
    ws.write(("    " + level).slice(-4));
  }

  ws.write(' };\n');
  ws.end();
});

// Compile firmware binary for release
gulp.task('release', function () {
  const binaries_dir = 'binaries';
  const environment = 'prod';

  if (!fs.existsSync(binaries_dir)) {
    fs.mkdirSync(binaries_dir);
  }

  var v_data = fs.readFileSync(sourceFolder + '/main.h');
  var re = /#define APP_VERSION \"(.+)\"/g;
  var version = re.exec(v_data.toString())[1];

  // Compile the binary
  exec('pio run --silent -t clean -e' + environment);
  exec('pio run --silent -e ' + environment, function (err, stdout, stderr) {
    console.log(stdout);
    console.log(stderr);
  });

  // Move the compiled binary to the binaries directory
  fs.renameSync('.pioenvs/' + environment + '/firmware.bin', binaries_dir + '/ailight-' + version + '.bin', function (err) {
    if (err) throw err;
  });

});

// Default task
gulp.task('default', ['build']);
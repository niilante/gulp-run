'use strict';

var Path = require('path');
var Stream = require('stream');
var expect = require('chai').expect;
var gulp = require('gulp');
var run = require('../');


describe('gulp-run', function () {

	var sample_filename = Path.join(__dirname, 'sample.input.txt');

	it('should work with buffers', function (done) {

		gulp.src(sample_filename, {buffer:true})  // Each line of the file is the line number.
			.pipe(run('awk "NR % 2 == 0"'))         // Get the even lines with awk.
			.pipe(compare('2\n4\n6\n8\n10\n12\n'))  // Compare the output.
			.pipe(call(done))                       // Profit.

	});


	it('should work with streams', function (done) {

		gulp.src(sample_filename, {buffer:false}) // Each line of the file is the line number.
			.pipe(run('awk "NR % 2 == 0"'))         // Get the even lines with awk.
			.pipe(compare('2\n4\n6\n8\n10\n12\n'))  // Compare the output.
			.pipe(call(done))                       // Profit.

	});


	it('should start pipelines', function (done) {

		run('echo Hello World').exec()      // Start a command with `.exec()`.
			.pipe(compare('Hello World\n')) // You don't even have to pipe from it
			.pipe(call(done))               // i.e. when you want to just run the command, use exec.

	});
});



/// Helpers
/// --------------------------------------------------

// Get a vinyl stream that calls a function whenever a file is piped in.
var call = function (callback1) {
	var stream = new Stream.Transform({objectMode:true});
	stream._transform = function (file, enc, callback2) {
		this.push(file);
		process.nextTick(callback2);
		process.nextTick(callback1);
	}
	return stream;
}


// Get a vinys stream that throws if the contents of the piped-in file doesn't match.
var compare = function (match) {
	var stream = new Stream.Transform({objectMode:true});
	stream._transform = function (file, end, callback) {
		var contents;

		if (file.isStream()) {
			var new_file = file.clone();
			new_file.contents = new Stream.Transform();
			new_file.contents._transform = function (chunk, enc, callback) {
				this.push(chunk);
				return callback();
			};
			contents = '';
			file.contents.on('readable', function () {
				var chunk;
				while (chunk = file.contents.read()) {
					contents += chunk;
				}
			});
			file.contents.on('end', function () {
				expect(contents).to.equal(match);
				new_file.contents.push(contents);
				new_file.contents.end();
				stream.push(new_file);
				process.nextTick(callback);
			});
			return;
		}

		contents = (file.isBuffer()) ? file.contents.toString() : file.contents;
		expect(contents).to.equal(match);
		this.push(file);
		process.nextTick(callback);
		return;
	}
	return stream;
}


// Get a vinyl stream that tees the contents of the piped-in file to the given text stream.
// Useful for debugging, like `stream.pipe(tee(process.stdout))` to print the stream.
var tee = function (out) {
	var stream = new Stream.Transform({objectMode:true});
	stream._transform = function (file, enc, callback) {
		var push = this.push.bind(this);

		if (file.isStream()) {
			var new_file = file.clone();
			new_file.contents = new Stream.Transform();
			new_file.contents._transform = function (chunk, enc, callback) {
				this.push(chunk);
				return callback();
			};
			file.contents.on('readable', function () {
				var chunk;
				while (chunk = file.contents.read()) {
					out.write(chunk);
					new_file.contents.write(chunk);
				}
			});
			file.contents.on('end', function () {
				new_file.contents.end();
				push(new_file);
				process.nextTick(callback);
			});
			return;
		}

		if (file.isBuffer()) {
			out.write(file.contents);
			push(file);
			process.nextTick(callback);
			return;
		}

		// Else - file.isNull()
		push(file);
		return;
	};
	return stream;
}
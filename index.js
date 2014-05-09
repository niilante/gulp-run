/// gulp-run
/// ==================================================
/// Pipe to shell commands in gulp.
///
/// `var run = require('gulp-run')`

'use strict';

var child_process = require('child_process');
var Stream = require('stream');

var Vinyl = require('vinyl');

var parser = require('./lib/command-parser');


/// `var cmd = run(command)`
/// --------------------------------------------------
/// Gets a stream for a Unix shell command to which you can pipe vinyl files (the stuff gulp
/// passes around). A child process is spawned for each file piped in, and the file is read into
/// the child processes's stdin. You can also run the command directly with
/// `run(command).exec(callback)`.
///
/// Additionally, `./node_modules/.bin` is prepended to the PATH for the child process, so you have
/// access to all the binaries provided by your module's dependencies.
///
/// ### Arguments
/// 1. `command` *(String)*: The command to run.
///
/// ### Returns
/// *(Stream.Transform in Object Mode)*: The stream you always wanted.

var run = module.exports = function (command) {

	// Parse the command.
	var ast = parser.parse(command);
	var cmd = ast.elements[0].textValue;
	var args = [];
	ast.elements[2].elements.forEach(function (arg_node) {
		args.push(arg_node.arg.textValue);
	});

	// The object we return.
	var stream = new Stream.Transform({objectMode: true});

	// The environment for the child process.
	var env = process.env;
	env.PATH = './node_modules/.bin:' + env.PATH;


	/// `readable.pipe(cmd)` and `cmd.pipe(writeable)`
	/// --------------------------------------------------
	/// Use Unix commands in your pipeline.
	///
	/// Spawns a new child process of the command for each vinyl file piped. The file is taken as
	/// the command's stdin, and a new vinyl file pushed containing the command's stdout.
	///
	/// ### Example
	///
	/// ```javascript
	/// gulp.task('even-lines', function () {
	///     gulp.src('path/to/input/*')             // Get input files.
	///         .pipe(run('awk "NR % 2 == 0"'))     // Use awk to extract the even lines.
	///         .pipe(gulp.dest('path/to/output')); // Profit.
	/// });
	/// ```

	stream._transform = function (file, enc, done) {

		if (file.isNull()) {
			stream.push(file);
			process.nextTick(done);
			return;
		}

		var child = child_process.spawn(cmd, args, {env:env});
		file.pipe(child.stdin)

		// Streams - pass the child's stdout through
		if (file.isStream()) {
			file.contents = child.stdout;
			stream.push(file);
			process.nextTick(done);
			return;
		}

		// Buffers - buffer the entier output before continuing the pipeline
		if (file.isBuffer()) {
			file.contents = new Buffer(0);
			var stdout = child.stdout;
			stdout.on('readable', function () {
				var chunk = stdout.read()
				if (chunk !== null) {
					file.contents = Buffer.concat(
						[file.contents, chunk],
						file.contents.length + chunk.length
					);
				}
			});
			stdout.on('end', function () {
				stream.push(file);
				process.nextTick(done);
			});
			return;
		}

		// Anything else
		// TODO: file is neither a stream nor a buffer nor null.
		// Throw an error.
	}


	/// `cmd.exec([print])`
	/// --------------------------------------------------
	/// Executes the command immediatly, returning the output as a stream of vinyl.
	/// Use this method to start a pipeline in gulp.
	///
	///
	/// ### Arguments
	/// 1. `[print]` *(Boolean)*: If true, tee the command's output to `process.stdout` with
	///     each line prepended by the string "[*title*] " where *title* is the command's name.
	///
	/// ### Returns
	/// *(Stream.Readable in Object Mode)*: A stream containing exactly one vinyl file. The file's
	/// contents is the stdout stream of the file.
	///
	/// ### Example
	///
	/// ```javascript
	/// gulp.task('hello-world', function (callback) {
	///     run('echo Hello World').exec(true);
	///     // prints "[echo] Hello World\n"
	/// });
	/// ```

	stream.exec = function (print) {
		var child = child_process.spawn(cmd, args, {env:env});

		child.stdin.end();

		var file = new Vinyl({
			contents: (print) ? child.stdout.pipe(tee(cmd)) : child.stdout,
			path: cmd
		});

		var exec_stream = new Stream.Transform({objectMode:true});
		exec_stream._transform = function (file, enc, callback) {
			exec_stream.push(file);
			process.nextTick(callback);
		};
		exec_stream.end(file);

		return exec_stream;
	}

	return stream;
}


// Tee's a stream to stdout, prepending lines with a title.
var tee = function (title) {
	var stream = new Stream.Transform();
	stream._transform = function (chunk, enc, callback) {
		process.stdout.write('[' + title + '] ' + chunk.toString());
		stream.push(chunk);
		process.nextTick(callback);
		return;
	}
	return stream;
}
// Convert video to webm format.

'use strict';


import fs = require('fs');
import path = require('path');
import glob = require('glob');
import child_process = require('child_process');
import _ = require('lodash');

import utils = require('../../utils');

var spawn = child_process.spawn;

export = encodeVideo;

/**
 * Encode VOB files from a folder to webm.
 * @see https://trac.ffmpeg.org/wiki/vpxEncodingGuide
 * @see https://sites.google.com/a/webmproject.org/wiki/ffmpeg
 *
 * @todo At the end, delete the ffmpeg2pass-0.log file.
 *
 * @param {string} dvdPath
 */
function encodeVideo(dvdPath: string) {
  process.stdout.write('\nEncoding VOB files:\n');

  var vobPath = path.join(dvdPath, '/VIDEO_TS', '/*.VOB');
  glob(vobPath, function(err, vobFiles) {
    if (err) {
      console.error(err);
    }

    // Group by video (e.g. All VTS_01_xx.VOB together).
    vobFiles = _.groupBy(vobFiles, function(vobFile) {
      return vobFile.replace(/_[1-9]\.VOB/i, '.VOB');
    });

    // Retain the values only.
    vobFiles = _.values(vobFiles);

    // Sort the files.
    vobFiles = _.forEach(vobFiles, function(vobFile) {
      return vobFile.sort(function(a, b) {
        return a - b;
      });
    });

    var pointer = 0;

    next(vobFiles[pointer]);

    // There are better ways to do async...
    function next(vobFile) {
      var output = utils.convertVobPath(vobFile[0]);
      var prefix = path.join(vobFile[0].replace(/\/VIDEO_TS\/.+/i, '/web/'), '/ffmpeg2pass');
      var input = '';

      if (vobFile.length === 1) {
        input = path.normalize(vobFile[0]);
      } else {
        input = 'concat:' + vobFile.map(function(file) {
          return path.normalize(file);
        }).join('|');
      }

      var pass1Cmd = [
        '-i', input,
        '-pass', '1',
        '-passlogfile', prefix,
        // Video
        '-c:v', 'libvpx',
        '-b:v', '1000k',
        // Audio
        '-c:a', 'libvorbis',
        '-b:a', '128k',
        // @todo Read from source.
        '-r', '30/1.001',
        // libvpx options
        '-cpu-used', '0',
        '-lag-in-frames', '16',
        '-quality', 'best',
        '-qmin', '0',
        '-qmax', '51',
        // ffmpeg options
        '-bufsize', '500k',
        '-threads', '16',
        '-vf', 'yadif=1:1:1', // Deinterlace
        '-an', // Disable audio for pass 1.
        '-f', 'rawvideo',
        '-y', // Overwrite by default.
        'NUL' // /dev/null
      ];

      var pass2Cmd = [
        '-i', input,
        '-pass', '2',
        '-passlogfile', prefix,
        // Video
        '-c:v', 'libvpx',
        '-b:v', '1000k',
        // Audio
        '-c:a', 'libvorbis',
        '-b:a', '128k',
        // @todo Read from source.
        '-r', '30/1.001',
        // libvpx options
        '-cpu-used', '0',
        '-lag-in-frames', '16',
        '-quality', 'best',
        '-qmin', '0',
        '-qmax', '51',
        // libvpx options for pass 2
        '-auto-alt-ref', '1',
        '-maxrate', '1000k',  // pass 2
        '-bufsize', '500k',
        '-threads', '16',
        '-vf', 'yadif=1:1:1', // Deinterlace
        '-y', // Overwrite by default.
        output
      ];

      console.log(pass1Cmd.join(' '));
      console.log(pass2Cmd.join(' '));

      var pass1 = spawn('ffmpeg', pass1Cmd);

      pass1.stdout.on('data', function(data) {
        process.stdout.write(data);
      });

      pass1.stderr.on('data', function(data) {
        process.stderr.write(data);
      });

      pass1.on('close', function() {
        var pass2 = spawn('ffmpeg', pass2Cmd);

        pass2.stdout.on('data', function(data) {
          process.stdout.write(data);
        });

        pass2.stderr.on('data', function(data) {
          process.stderr.write(data);
        });

        pass2.on('close', function() {
          // Next iteration.
          pointer++;
          if (pointer < vobFiles.length) {
            setTimeout(function() {
              next(vobFiles[pointer]);
            }, 0);
          } else {
            // At the end of all iterations.
            console.log('That\'s all folks!')
          }
        });
      });
    }
  });
}

// https://nodejs.org/api/https.html
var https = require('https');

// https://nodejs.org/api/fs.html
var fs = require('fs');

var env

////////////////////////////////////////////////////////////////////////////////
// HTTPS
////////////////////////////////////////////////////////////////////////////////

var wink_https = function(auth_token, method, path, put_body, callback) {
    var options = {
        host: 'winkapi.quirky.com',
        path: path,
        method: method,
        headers: {}
    };

    if (put_body !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = put_body.length;
    }

    var the_request = function() {
        var result = {};

        var req = https.request(options, function(res) {
            result.status = res.statusCode;
            result.headers = res.headers;
            result.body = '';
            res.on('data', function (chunk) {
                result.body += chunk;
            });
            res.on('end', function() {
                if (callback !== undefined) {
                    callback(result.status == 200 ? undefined : result.status, result);
                }
            });
        });

        // write data to request body
        if (put_body !== undefined) {
            req.write(put_body);
        }

        req.end();

        req.on('error', function(e) {
            result.error = e;
            if (callback !== undefined) {
                callback(e, result);
            }
        });
    };

    // Special case for when we're specifically trying to get the auth token
    if (path !== '/oauth2/token') {
        options.headers['Authorization'] = 'Bearer ' + auth_token;
        the_request(callback);
    }
    else {
        env.logger.info(">>>>>", "Fetching new Auth Token");
        the_request(callback);
    }
};

////////////////////////////////////////////////////////////////////////////////
// Wink exported interface
////////////////////////////////////////////////////////////////////////////////

var Wink = function() {};

Wink.prototype.init = function(_env) {
    env = _env;
};

// let's use brightness = [0, 100]
Wink.prototype.light_bulb = function(auth_token, device_id, brightness, callback) {
    var path = '/light_bulbs/' + device_id;
    env.logger.debug(">>>>Sending to Wink light_bulb: ", brightness);
    var parse_state_callback = function(err, result) {
        if (callback === undefined) {
            return;
        }

        if (err) {
            callback(err, result);
            return;
        }

        var body;
        try {
            body = JSON.parse(result.body);
        }
        catch(e) {
            callback(e, result);
            return;
        }

        var desired_state = body.data.desired_state;
        var powered = desired_state.powered;
        var brightness = desired_state.brightness;
        callback(undefined, powered ? brightness * 100 : 0);
    };

    // brightness argument => set the light bulb's state / brightness
    if (brightness !== undefined) {
        var put_body = JSON.stringify({
            'desired_state': { 'powered': brightness != 0, 'brightness': (brightness / 100) }
        });
        wink_https(auth_token, 'PUT', path, put_body, parse_state_callback);
    }

    // No argument => get the light bulb's state
    else {
        wink_https(auth_token, 'GET', path, undefined, parse_state_callback);
    }   
};

Wink.prototype.binary_switch = function(auth_token, device_id, powered, callback) {
    var path = '/binary_switches/' + device_id;
    return (wink_switch(auth_token, path,device_id, powered, callback));
};

Wink.prototype.light_switch = function(auth_token, device_id, powered, callback) {
    var path = '/light_bulbs/' + device_id;
    return (wink_switch(auth_token, path,device_id, powered, callback));
};

var wink_switch = function(auth_token, path, device_id, powered, callback) {
    env.logger.debug(">>>>Sending to Wink wink_switch: ",powered);
    var parse_state_callback = function(err, result) {
        if (callback === undefined) {
            return;
        }

        if (err) {
            callback(err, result);
            return;
        }

        var body;
        try {
            body = JSON.parse(result.body);
        }
        catch(e) {
            callback(e, result);
            return;
        }

        var desired_state = body.data.desired_state;
        var powered = desired_state.powered;
        callback(undefined, powered ? true : false);
    };

    if (powered !== undefined) {
        var put_body = JSON.stringify({
            'desired_state': { 'powered': !!powered }
        });
        wink_https(auth_token, 'PUT', path, put_body, parse_state_callback);
    }
    else {
        wink_https(auth_token, 'GET', path, undefined, parse_state_callback);
    }
};

Wink.prototype.shade = function(auth_token, device_id, position, callback) {
    var path = '/shades/' + device_id;
    env.logger.debug(">>>>Sending to Wink shade: ",position);
    var position_map = {
        'up': 1,
        'down': 0
    };
    var position_unmap = {
        1: 'up',
        0: 'down'
    };

    var parse_state_callback = function(err, result) {
        if (callback === undefined) {
            return;
        }

        if (err) {
            callback(err, result);
            return;
        }

        var body;
        try {
            body = JSON.parse(result.body);
        }
        catch(e) {
            callback(e, result);
            return;
        }

        var desired_state = body.data.desired_state;
        var position = position_unmap[desired_state.position];
        if (position === undefined) {
            position = 'stopped';
        }
        callback(undefined, position);
    };

    if (position !== undefined && position_map[position] !== undefined) {
        var put_body = JSON.stringify({
            'desired_state': { 'position': position_map[position] }
        });
        wink_https(auth_token, 'PUT', path, put_body, parse_state_callback);
    }
    else {
        wink_https(auth_token, 'GET', path, undefined, parse_state_callback);
    }
};

// https://groups.google.com/forum/#!topic/openhab/pmrns4Yb8fM
// {"data":{"access_token":"267.....094","refresh_token":"b1b.....da8","token_type":"bearer","token_endpoint":"https://winkapi.quirky.com/oauth2/token"},"errors":[],"pagination":{},"access_token":"2670e.....1094","refresh_token":"b1b.....da8","token_type":"bearer","token_endpoint":"https://winkapi.quirky.com/oauth2/token"}
Wink.prototype.auth_token = function(client_id, client_secret, username, password, callback) {
    var path = '/oauth2/token';

    var put_body = JSON.stringify({
        'client_id': client_id,
        'client_secret': client_secret,
        'username': username,
        'password': password,
        'grant_type': 'password',
    });

    wink_https(undefined, 'POST', path, put_body, function(err, result) {
        if (callback === undefined) {
            return;
        }

        if (err) {
            callback(err, result);
            return;
        }

        var body;
        try {
            body = JSON.parse(result.body);
        }
        catch(e) {
            callback(e, result);
            return;
        }

        var access_token = body.data.access_token;
        env.logger.info(">>>> Got new Auth token " + access_token );
        callback(undefined, access_token);
    });
   
       
};

Wink.prototype.device_id_map = function(auth_token, callback) {
    wink_https(auth_token, 'GET', '/users/me/wink_devices', undefined, function(err, result) {
        if (err) {
            callback(err, result);
            return;
        }

        var body;
        try {
            body = JSON.parse(result.body);
        }
        catch(e) {
            callback(e, result);
            return;
        }

        var data = body.data;
        env.logger.debug(">>>>Device List: ", JSON.stringify(data))
        callback(undefined, data);
    });
};

module.exports = new Wink(env);


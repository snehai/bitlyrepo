var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path')
  , fs=require('fs')
  , aws = require('aws-sdk')
  , queueUrl = "https://sqs.us-west-2.amazonaws.com/060340690398/team6lr";


var app = express();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var redis = require('redis');
var client = redis.createClient(6379, '52.24.39.35');
client.on('connect', function(err,result) {
    console.log('connected');
});

aws.config.loadFromPath(__dirname + '/config.json');
var sqs = new aws.SQS();
console.log('sqs'+sqs);

// all environments
app.set('port', process.env.PORT || 7000);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {  
	app.use(express.errorHandler());
}

app.get('/', routes.index);
app.get('/users', user.list);
app.get('/:searchText', function (request,response){
        console.log(request.params.searchText);
        var shortURL = request.params.searchText;
        var ip_address = null;
        if(request.headers['x-forwarded-for']){
            ip_address = request.headers['x-forwarded-for'].split(',')[0];
        }
        else {
            ip_address = request.connection.remoteAddress;
        }
        client.get(shortURL , function(err,longURL){
                      if (err) {
                             console.error("error");
                             response.render('error',{errormessage : 'Your request cannot be serviced at the current moment.'});
                        } else {
                             console.log(longURL);
                             if(longURL == null){
                                    getLongURL(shortURL,function(longURL){
                                        if(longURL && longURL.length >0){
                                        client.set(shortURL , longURL);
                                        response.redirect(longURL);
                                        sendMessageSQS(longURL,shortURL, ip_address,function(result){
                                        	console.log('success'+result);
                                        });
                                        }else{
                                                console.log('no such link');
                                                response.render('error',{errormessage : 'Your request cannot be serviced at the current moment.'});
                                        }
                                     });
                               }else{
                                     response.redirect(longURL);
                                     sendMessageSQS(longURL,shortURL, ip_address ,function(result){
                                     	console.log('success'+result);
                                     });
                               }
                        }
         });
      });

var request = require('request');
var getLongURL = function(shortURL, callback) {
	request({
		url : "https://52.27.37.162",
		method : "POST",
		json: true,
		body : {
		"action" : "read",
		"shorturl" : shortURL
		}
		}, function(error, response, body){
		
		if(error){
			callback(null);	
		}else{
		console.log(body);
		if(body.status == 'fail'){
		console.log('error');
		callback(null);
		} else if(body.status == 'success'){
		callback(body.longurl);
		}else if(body.status == 'not found'){
		callback(null);
		}
		}
		});
}

var sendMessageSQS = function(longurl, shorturl,sourceIP){
    var message = {
        longurl : longurl,
        shorturl : shorturl,
        source:sourceIP
    };
    console.log(message);
    var params = {
        MessageBody: JSON.stringify(message),
        QueueUrl: queueUrl,
        DelaySeconds: 0
    };
    
    sqs.sendMessage(params , function (err, data) {
        if(err){
            console.log("error: " + err);
        }
        else {
            console.log("data: " + JSON.stringify(data));
        }
    });
}

http.createServer(app).listen(app.get('port'), function(){
	console.log('Express server listening on port ' + app.get('port'));
	});
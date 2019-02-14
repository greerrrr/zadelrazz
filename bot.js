class RPGList {
    constructor(title, channelID) {
        this.channelID = channelID;
        this.title = title;
        this.path = __dirname+"/lists/"+channelID+"/"+title+".json"
        this.entries = [];
        fs.mkdir(__dirname+"/lists/"+channelID,
                  { recursive: true }, (err) => {
              if (err) throw err;
        });
        logger.info("initialized "+this.path);
        // If the file exists, load it; otherwise, save a blank file
        if (fs.existsSync(this.path)) {
            this.load();
        } else {
            this.save();
        }
    }

    //add an entry to a list
    addEntry(message) {
        this.entries.push(message);
        this.save();
    }

    //get a printable version with title and numbered entries
    get printable(){
        let printable = this.title+"\n";
            for (var entrynum = 0; entrynum < this.entries.length; entrynum++) {
                let humnum = entrynum + 1;
                printable = printable + humnum+". "+this.entries[entrynum]+"\n";
            };
        return printable;
    }

    get json(){
        return JSON.stringify(this);
    }

    load() {
        // Make sure this.path isn't an empty file so loading JSON
        // doesn't break everything
        if (fs.statSync(this.path)["size"] != 0) {
               this.entries = require(this.path);
        }
    }

    save() {
        if (this.entries.length == 0) {
            fs.writeFile(
                this.path,
                "[]",
                (err) => { if (err) throw err;
                           logger.info('saved '+this.path); }
            );
        } else {
            fs.writeFile(
                this.path,
                JSON.stringify(this.entries),
                (err) => { if (err) throw err;
                           logger.info('saved '+this.path); }
            );
        }
    }
}

class Zadelrazz {
    constructor(discordClient) {
        this.bot = discordClient;
        this.listeningForListItems = {};
        this.helpText = "Commands:"
        + "\n!new [NAME] : Start listening for entries to table NAME."
        + "\n    -> Each following message that begins with i., where i is an integer, will be added to the table."
        + "\n!title : Print the active table's name."
        + "\n!end : Close the active table, list its contents, and save them to the server."
        + "\n!help : Display this help message.";
    }
    initializeTitles(logger) {
        var titles = {};
        logger.info("Loading lists according to titles.json:");
        if (fs.existsSync("./titles.json")) {
            titles = require("./titles.json");
        }
        logger.info(titles);
        return titles;
    }
    loadActiveListsFromTitles(titles, logger) {
        //for each active title, load that list from file
        //key = channelID, titles[key] = title
        var activeLists = {};
        for (var channelID in titles) {
            logger.info("loading "+titles[channelID]+" for channelID "+channelID);
            this.listeningForListItems[channelID] = true
            let newlist = new RPGList(titles[channelID], channelID);
            activeLists[channelID] = newlist;
            logger.info("success");
        }
        return activeLists;
    }
    writeTitlesToJSON(titles) {
        fs.writeFile('titles.json',
            JSON.stringify(titles),
            (err) => { if (err) throw err; }
        );
    }
    newList(channelID, title) {
        // If this channel already has a list open, close it
        if (titles[channelID]) {
            this.endActiveList(channelID)
        }
        // Then, bombs away!
        this.listeningForListItems[channelID] = true
        titles[channelID] = title;
        this.writeTitlesToJSON(titles);
        activeLists[channelID] = new RPGList(title, channelID);
        this.bot.sendMessage({
            to: channelID,
            message: 'Starting: ' + titles[channelID]
        });
    }
    sendActiveTitle(channelID) {
        if (this.listeningForListItems[channelID] && channelID in activeLists) {
            this.bot.sendMessage({
                to: channelID,
                message: 'Current: '+titles[channelID]
            });
        } else {
            this.bot.sendMessage({
                to: channelID,
                message: 'No current list for this channel.'
            });
        }
    }
    processListItem(channelID, message, evt) {
        if (this.listeningForListItems[channelID] && channelID in activeLists) {
            let entrytext = message.substring(message.indexOf(".")+1);
            entrytext = entrytext.trim();
            bot.addReaction({
                channelID: channelID,
                messageID: evt.d.id,
                reaction: "🤖"
            }, (err,res) => {
                if (err) logger.info(err)
            });
            logger.info('The entry is: ' + entrytext);
            logger.info(activeLists[channelID].json);
            activeLists[channelID].addEntry(entrytext);
        } else {
            logger.info('Ignoring apparently list-item-like message.');
        }
    }
    endActiveList(channelID) {
        this.bot.sendMessage({
            to: channelID,
            message: activeLists[channelID].printable
        });
        activeLists[channelID].save();
        delete activeLists[channelID];
        delete titles[channelID];
        this.writeTitlesToJSON(titles);
        this.listeningForListItems[channelID] = false;
    }
    sendHelpText(channelID) {
        bot.sendMessage({
            to: channelID,
            message: this.helpText
        });
    }
}

var Discord = require('discord.io');
var fs = require('fs');
var logger = require('winston');
var auth = require('./auth.json');

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {
    colorize: true
});
logger.level = 'debug';

// Initialize Discord Bot
var bot = new Discord.Client({
    token: auth.token,
    autorun: true
});

// Confirm bot is ready
bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');
});

// Bring the big man in and let him do his business
var zd = new Zadelrazz(bot);

// Resume state if shit crashed last time, otherwise make new lists
var titles = zd.initializeTitles(logger);
var activeLists = zd.loadActiveListsFromTitles(titles, logger);

bot.on('message', function (user, userID, channelID, message, evt) {
    // The philosophy is that this bot.on() function handles incoming text and,
    // if they're valid commands, passes them on to Zadelrazz. It shouldn't
    // decide what he does with them except in the case of failure, where bot.on
    // politely requests that he send help text.

    // Listen for messages that start with `!` and process the first word
    // as a command
    if (message.substring(0, 1) == '!') {
        var args = message.substring(1).split(' ');
        var cmd = args[0];
        args = args.splice(1);

        switch(cmd) {
            // !new [title]
            case 'new':
                title = message.substring(5);
                zd.newList(channelID, title);
                break;
            case 'title':
                zd.sendActiveTitle(channelID);
                break;
            // save the list and reprint it collated
            case 'end':
                zd.endActiveList(channelID);
                break;
            case 'help':
                zd.sendHelpText(channelID);
                break;
            default:
                bot.sendMessage({ to: channelID, message: 'Unknown command.' });
                zd.sendHelpText();
        }
    }

    // Listen for list entries that are just a number and a dot
    let dotsplits = message.split('.');
    if (dotsplits[0].length > 0 && !isNaN(dotsplits[0])) {
        zd.processListItem(channelID, message, evt);
    }

})

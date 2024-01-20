const axios = require("axios");
const cron = require("node-cron");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const bot = new TelegramBot("6970184674:AAFvvY4lNown-wHU452QQZLdw6nR5Q3gF9c");

let userAddresses = [];
let allActivities = [];
let contractCounters = {};
let runNumber = 1;
let runIndex = 1;

const topicMessageId = 3;

function getNextIndex(index) {
  return index < 10000 ? index + 1 : 1;
}

function getRunIndex() {
  const filename = "runIndex.txt";
  if (fs.existsSync(filename)) {
    runIndex = parseInt(fs.readFileSync(filename, "utf8"));
  } else {
    fs.writeFileSync(filename, runIndex.toString());
  }
}

getRunIndex();

// Create a new directory for this run if it doesn't exist
const dir = `./${path.basename(__filename)}_${
  new Date().toISOString().replace(/:/g, "-").split(".")[0]
}_RUN-${runIndex}`;
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

async function compressJsonFiles(dir) {
  try {
    const files = await readdir(dir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    for (let file of jsonFiles) {
      const filePath = path.join(dir, file);
      const fileContents = await readFile(filePath);
      const compressedContents = await gzip(fileContents);
      await writeFile(`${filePath}.gz`, compressedContents);

      // Optional: Delete the original file after compression
      fs.unlinkSync(filePath);
    }

    console.log('Compression of .json files completed.');
  } catch (error) {
    console.error(`Error compressing .json files: ${error}`);
  }
}

const fetchWalletAddresses = async () => {
  try {
    const response = await axios.get(
      "https://api.dune.com/api/v1/query/3232284/results?api_key=jB8gmgsFjP3gGAIOvUlBObmpLxEJtyRZ",
    );
    console.log(response.data);
    const data = response.data.result.rows;
    userAddresses = data.map((row) => row.to);
  } catch (error) {
    console.error(`Error fetching wallet addresses: ${error}`);
  }
};

const fetchUserActivity = async () => {
  try {
    for (let i = 0; i < userAddresses.length; i++) {
      const response = await axios.get(
        `https://api.reservoir.tools/users/activity/v6?users=${userAddresses[i]}&limit=20&includeMetadata=true`,
        {
          headers: {
            Authorization: "Bearer e99db6cd-9fce-5de3-8c90-3717a62e924c",
          },
        },
      );

      const newData = response.data.activities;
      allActivities.push(...newData);

      // Create a new directory for each poll if it doesn't exist
      const pollDir = `${dir}/poll-${runNumber}`;
      if (!fs.existsSync(pollDir)) {
        fs.mkdirSync(pollDir);
      }

      // Write the data to a new file in the directory
      const timestamp = new Date().toISOString().replace(/:/g, "-");
      const filename = `${pollDir}/walletaddress_${userAddresses[i]}_${timestamp}_RUN-${runIndex}-${runNumber}.json`;
      fs.writeFileSync(filename, JSON.stringify(response.data, null, 2));
    }

    allActivities.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    for (let activity of allActivities) {
      const contract = activity.collectionId;
      contractCounters[contract] = (contractCounters[contract] || 0) + 1;
      if (contractCounters[contract] === 5) {
        const floorPrice = `${
          activity.price ? activity.price.amount.decimal : "N/A"
        } ${activity.price ? activity.price.amount.symbol : ""} (${
          activity.price ? `$${activity.price.amount.usd}` : "N/A"
        })`;
        const collectionName = activity.collectionName
          ? activity.collectionName
          : "N/A";
        const exchange = activity.domain;
        const time = activity.createdAt;
        const telegramOutput = `BUY ${collectionName} AT ${floorPrice}\nCONTRACT ADDRESS: ${contract}\nEXCHANGE: ${exchange}\nTIME: ${time}`;
        bot.sendMessage("-1002092774342", telegramOutput, {
          reply_to_message_id: topicMessageId,
        });

        // Write the Telegram output to a new file
        const telegramFilename = `script_${path.basename(
          __filename,
        )}_${timestamp}_telegram.json`;
        fs.writeFileSync(
          telegramFilename,
          JSON.stringify({ telegramOutput }, null, 2),
        );

        contractCounters[contract] = 0;
      }
    }
    allActivities = [];
    runNumber++;
  } catch (error) {
    console.error(`Error fetching user activity: ${error}`);
  }
};

cron.schedule("11 07 * * 0", fetchWalletAddresses);
setInterval(fetchUserActivity, 180000);

process.on("exit", () => {
  runIndex = getNextIndex(runIndex);
  fs.writeFileSync("runIndex.txt", runIndex.toString());
  compressJsonFiles(dir);
});

//server
const express = require('express')
const app = express();
const port = 42000;

app.get('/', (req, res) => {
  res.send('Hello World!')
})

const server = app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})

// Listen for TERM signal .e.g. kill 
process.on ('SIGTERM', () => {
  server.close(() => {
    console.log('Process terminated')
  })
})

// Listen for INT signal e.g. Ctrl-C
process.on ('SIGINT', () => {
  server.close(() => {
    console.log('Process terminated')
  })
})


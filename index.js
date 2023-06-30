
const { google } = require("googleapis");
const readline = require("readline");
const util = require("util");
const fs = require("fs");

// Constants
const TOKEN_PATH = "token.json";
const LABEL_NAME = "Vacation Auto Reply";

// Gmail API setup
const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];
const credentials = require("./config/credentials.json");

// Create OAuth2 client
const { client_secret, client_id, redirect_uris } = credentials.web;
const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

// Create readline interface for user authorization
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Helper function to read tokens from file
const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

// Authenticate with Gmail API
async function authenticate() {
  try {
    const token = await readFileAsync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
  } catch (err) {
    return getAccessToken();
  }
}

// Get access token interactively
function getAccessToken() {
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
    });

    console.log("Authorize this app by visiting this URL:", authUrl);

    rl.question("Enter the code from that page here: ", (code) => {
      rl.close();

      oAuth2Client.getToken(code, (err, token) => {
        if (err) {
          reject(err);
        } else {
          oAuth2Client.setCredentials(token);

          // Save the token for future use
          writeFileAsync(TOKEN_PATH, JSON.stringify(token))
            .then(() => {
              console.log("Token stored to", TOKEN_PATH);
              resolve();
            })
            .catch((err) => reject(err));
        }
      });
    });
  });
}

// Check for new emails
async function checkEmails() {
  try {
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    // Fetch unread emails
    const res = await gmail.users.messages.list({
      userId: "me",
      q: "is:unread",
    });

    const messages = res.data.messages;

    if (messages && messages.length) {
      // Process each email
      for (const message of messages) {
        const email = await getEmail(gmail, message.id);

        // Check if email thread has prior replies
        if (!hasPriorReplies(email)) {
          // Send auto-reply
          const autoReply =
            "Thank you for your email. I am currently on vacation and will respond when I return.";

          await sendEmail(gmail, email.threadId, autoReply);

          // Apply label and move email to labeled folder
          await applyLabel(gmail, email.id, LABEL_NAME);

          console.log("Auto-reply sent:", email.id);
        }
      }
    }
  } catch (err) {
    console.error("Error checking emails:", err);
  }
}

// Fetch email details
async function getEmail(gmail, messageId) {
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  return res.data;
}

// Check if email thread has prior replies
function hasPriorReplies(email) {
  // TODO: Implement logic to check for prior replies
  // Compare sender's email with your own to identify prior replies
  const senderEmail = email.payload.headers.find((header) => header.name === 'From').value;
  
  // Check if sender's email matches your own
  const yourEmail = 'ay622012002@gmail.com'; // Replace with your own email address
  const hasReplies = senderEmail !== yourEmail;

  return false;
}

// Send email
async function sendEmail(gmail, threadId, message) {
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      threadId: threadId,
      raw: Buffer.from(createEmail(message)).toString("base64"),
    },
  });

  return res.data;
}

// Create email
function createEmail(message) {
  const emailLines = [];

  emailLines.push("From: Ashish Yadav <ay622012002@gmail.com>");
  emailLines.push("To: recipient@example.com");
  emailLines.push("Content-Type: text/plain; charset=utf-8");
  emailLines.push("MIME-Version: 1.0");
  emailLines.push("Subject: Vacation Auto Reply");
  emailLines.push("");
  emailLines.push(message);

  return emailLines.join("\r\n");
}

// Apply label to email
async function applyLabel(gmail, messageId, labelName) {
  const res = await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds: [await getOrCreateLabelId(gmail, labelName)],
    },
  });

  return res.data;
}

// Get or create label ID
async function getOrCreateLabelId(gmail, labelName) {
  const res = await gmail.users.labels.list({ userId: "me" });

  const labels = res.data.labels;

  // Check if label already exists
  const existingLabel = labels.find((label) => label.name === labelName);
  if (existingLabel) {
    return existingLabel.id;
  }

  // Create new label
  const newLabel = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
    },
  });

  return newLabel.data.id;
}

// Run the application
async function run() {
  await authenticate();

  setInterval(checkEmails, getRandomInterval(45, 120) * 1000);
}

// Generate random interval
function getRandomInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// Start the application
run().catch((err) => console.error("Error running the application:", err));

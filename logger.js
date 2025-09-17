const fs = require('fs');
const path = require('path');

// Function to ensure a directory exists
function ensureDirectoryExistence(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// Function to log messages to a specific file
function logMessage(logType, message) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');

    const dirPath = path.join(__dirname, 'logs', logType, `${year}${month}${day}`);
    const fileName = `${hour}.log`;
    const logFilePath = path.join(dirPath, fileName);

    const timestamp = now.toISOString();
    const log = `\n===============================================================\n${message}\n`;

    // Ensure the directory exists
    ensureDirectoryExistence(dirPath);

    // Append the log message to the file
    fs.appendFile(logFilePath, log, (err) => {
        if (err) throw err;
    });
}


// Export the logMessage function
module.exports = logMessage;

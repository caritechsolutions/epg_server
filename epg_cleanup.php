<?php

// Database connection information
$servername = "localhost";
$username = "newroot";
$password = "Password!10";
$dbname = "cariepg";

// Create connection
$conn = new mysqli($servername, $username, $password, $dbname);

// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}


// At start
$stmt = $conn->prepare("INSERT INTO epg_tracking (action_type, action_details) VALUES ('cleanup', 'Starting EPG cleanup')");
$stmt->execute();

// SQL query to delete entries older than 2 days
$sql = "DELETE FROM events WHERE ADDTIME(start_time, duration) < DATE_SUB(NOW(), INTERVAL 2 DAY)";

// Execute the query
if ($conn->query($sql) === TRUE) {
    echo "Entries older than 2 days deleted successfully.\n";

// After successful cleanup
$affectedRows = $conn->affected_rows;
$stmt = $conn->prepare("INSERT INTO epg_tracking (action_type, action_details) VALUES ('cleanup', ?)");
$stmt->execute(["Cleanup completed. Deleted $affectedRows old entries"]);

} else {
    echo "Error deleting entries: " . $conn->error . "\n";
}

// Close the connection
$conn->close();

?>

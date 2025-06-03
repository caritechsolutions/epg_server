<?php
error_reporting(E_ALL);
ini_set('display_errors', '1');

if (isset($_GET['transport'])) {
    $transportname = $_GET['transport'];
  }

if (isset($argv[1])) {
    $transportname = $argv[1];
}

// Database configuration
$servername = "localhost";
$username = "newroot";
$password = "Password!10";
$dbname = "cariepg";

try {
    // Create connection
    $conn = new PDO("mysql:host=$servername;dbname=$dbname", $username, $password);
    // Set the PDO error mode to exception
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);


// Log start of update
try {
    $stmt = $conn->prepare("INSERT INTO epg_tracking (action_type, action_details) VALUES ('epg_update', ?)");
    $stmt->execute(["Starting EPG update for transport: $transportname"]);
} catch (PDOException $e) {
    error_log("EPG Tracking Error: " . $e->getMessage());
}


$filename = '/var/www/html/' . $transportname . '.xml';
$xmlData = file_get_contents($filename);

$xml = simplexml_load_string($xmlData);

// Array to store the extracted data
$events = array();

// Array to track unique event IDs
// $unique_event_ids = array();


function getServiceName($conn, $service_id) {
    $stmt = $conn->prepare("SELECT service_name FROM services WHERE service_id = :service_id");
    $stmt->bindParam(':service_id', $service_id);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ? $row['service_name'] : "Service name not found";
}


// Initialize an array to store unique event-service combinations
$unique_event_service_combinations = [];



// Iterate through each <EIT> element in the XML
foreach ($xml->EIT as $eit) {
    $serviceId = (string)$eit['service_id'];


$service_name = getServiceName($conn, $serviceId);

// echo "Service Name for Service ID $serviceId: $service_name<br>";



    
// echo $serviceId . "<br>";
    // Iterate through each <event> element within the <EIT> element
    foreach ($eit->event as $event) {

	$eventId = (string)$event['event_id'];
        $event_service_key = $eventId . '_' . $serviceId;

// Only add the event if its ID is unique
        if (!in_array($event_service_key, $unique_event_service_combinations)) {

        $unique_event_service_combinations[] = $event_service_key;
        $startTime = (string)$event['start_time'];
	$duration = (string)$event['duration'];
        $eventName = (string)$event->short_event_descriptor->event_name;
        $event_short_text = (string)$event->short_event_descriptor->text;
        $event_desc = (string)$event->extended_event_descriptor->text;


// echo $startTime . "<br>";
// echo $eventName . "<br>";      


// Store the service ID, service name, start time, and event name in the events array
        $events[] = array(
            'event_id' => $eventId,
            'service_id' => $serviceId,
            'service_name' => $service_name,
            'start_time' => $startTime,
	    'duration' => $duration,
            'event_name' => $eventName,
            'event_short_text' => $event_short_text,
            'event_desc' => $event_desc
        ); 
        
	}
    }
}



// Function to custom sort the array by service name and start time
usort($events, function($a, $b) {
    if ($a['service_name'] == $b['service_name']) {
        return strtotime($a['start_time']) - strtotime($b['start_time']);
    }
    return strcmp($a['service_name'], $b['service_name']);
});


// Function to check if event ID exists in the database
    function eventExists($conn, $eventId, $serviceId) {
        $stmt = $conn->prepare("SELECT COUNT(*) FROM events WHERE event_id = :event_id AND service_id = :service_id");
        $stmt->bindParam(':event_id', $eventId);
        $stmt->bindParam(':service_id', $serviceId);
        $stmt->execute();
        return $stmt->fetchColumn() > 0;
    }


 // Display the sorted data
$t = 1;
$s = 1;
// foreach ($events as $event) {
//    echo "Service Name: " . $event['service_name'] . " - Service ID: " . $event['service_id'] . " - Start Time: " . $event['start_time'] . " - Event Name: " . $event['event_name'] . " " .$event['event_desc'] ."<br>";
 
//}


// Insert only unique events into the database
    foreach ($events as $event) {
        if (!eventExists($conn, $event['event_id'], $event['service_id'])) {
            $stmt = $conn->prepare("INSERT INTO events (event_id, service_id, service_name, start_time, duration, event_name, event_desc) VALUES (:event_id, :service_id, :service_name, :start_time, :duration, :event_name, :event_desc)");
            $stmt->bindParam(':event_id', $event['event_id']);
            $stmt->bindParam(':service_id', $event['service_id']);
           $stmt->bindParam(':service_name', $event['service_name']);
            $stmt->bindParam(':start_time', $event['start_time']);
            $stmt->bindParam(':duration', $event['duration']);
            $stmt->bindParam(':event_name', $event['event_name']);
            $stmt->bindParam(':event_desc', $event['event_desc']);
            $stmt->execute();
             $t++;
        }else{
          $s++;
        }
           
    }

    echo ($t - 1) . " Events data inserted successfully! and " . ($s - 1) . " events skipped! in Transport " . $transportname . "\n";

// Log completion
try {
    $stmt = $conn->prepare("INSERT INTO epg_tracking (action_type, action_details) VALUES ('epg_update', ?)");
    $stmt->execute(["Completed EPG update for transport: $transportname. Added $t events, skipped $s events"]);
} catch (PDOException $e) {
    error_log("EPG Tracking Error: " . $e->getMessage());
}


}
catch(PDOException $e) {
    echo "Error: " . $e->getMessage();
}




$conn = null;




?>
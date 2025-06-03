<?php
// epg-api.php - Backend API for EPG Management

error_reporting(E_ALL);
ini_set('display_errors', 1);

// Database configuration
$dbHost = 'localhost';
$dbName = 'cariepg';
$dbUsername = 'newroot';
$dbPassword = 'Password!10';

try {
    $pdo = new PDO("mysql:host=$dbHost;dbname=$dbName;charset=utf8", $dbUsername, $dbPassword);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die(json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]));
}

// Handle request
$action = $_REQUEST['action'] ?? '';

switch ($action) {
    case 'get_status':
        getStatus();
        break;
    case 'get_channels':
        getChannels();
        break;
    case 'get_epg':
        getEPG();
        break;
    case 'add_event':
        addEvent();
        break;
    case 'update_event':
        updateEvent();
        break;
    case 'delete_event':
        deleteEvent();
        break;
    default:
        echo json_encode(['error' => 'Invalid action']);
}

function getStatus() {
    global $pdo;
    
    // First try to get from tracking table
    try {
        $stmt = $pdo->query("
            SELECT 
                action_type,
                MAX(executed_at) as last_executed
            FROM epg_tracking
            WHERE status = 'success'
            AND action_type IN ('epg_update', 'cleanup')
            GROUP BY action_type
        ");
        
        $tracking = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $tracking[$row['action_type']] = $row['last_executed'];
        }
        
        $lastUpdate = $tracking['epg_update'] ?? null;
        $lastCleanup = $tracking['cleanup'] ?? null;
    } catch (PDOException $e) {
        // Fallback to log file if tracking table doesn't exist
        $lastUpdate = getLastJobTime('/var/log/job.log', 'fill_epg.php');
        $lastCleanup = getLastJobTime('/var/log/job.log', 'epg_cleanup.php');
    }
    
    // Get event count and stats
    $stmt = $pdo->query("SELECT COUNT(*) as count FROM events");
    $eventCount = $stmt->fetch(PDO::FETCH_ASSOC)['count'];
    
    echo json_encode([
        'last_update' => $lastUpdate,
        'last_cleanup' => $lastCleanup,
        'event_count' => $eventCount
    ]);
}

function getLastJobTime($logFile, $searchString) {
    if (!file_exists($logFile)) {
        return null;
    }
    
    // Read last 100 lines of log file
    $lines = array_slice(file($logFile), -100);
    $lastTime = null;
    
    foreach (array_reverse($lines) as $line) {
        if (strpos($line, $searchString) !== false) {
            // Extract timestamp from log line
            if (preg_match('/^\[(.*?)\]/', $line, $matches)) {
                $lastTime = $matches[1];
                break;
            }
        }
    }
    
    return $lastTime;
}

function getChannels() {
    global $pdo;
    
    $stmt = $pdo->query("SELECT DISTINCT service_id, service_name FROM services ORDER BY service_name");
    $channels = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    header('Content-Type: application/json');
    echo json_encode($channels);
}

function getEPG() {
    global $pdo;
    
    $date = $_GET['date'] ?? date('Y-m-d');
    $channel = $_GET['channel'] ?? '';
    
    $startDate = $date . ' 00:00:00';
    $endDate = $date . ' 23:59:59';
    
    // Get events that start on this day OR continue from previous day
    $sql = "SELECT * FROM events WHERE 
            ((start_time >= ? AND start_time <= ?) 
            OR (start_time < ? AND ADDTIME(start_time, duration) > ?))";
    $params = [$startDate, $endDate, $startDate, $startDate];
    
    if ($channel) {
        $sql .= " AND service_id = ?";
        $params[] = $channel;
    }
    
    $sql .= " ORDER BY service_id, start_time";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $events = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Group by service_id
    $grouped = [];
    foreach ($events as $event) {
        $grouped[$event['service_id']][] = $event;
    }
    
    header('Content-Type: application/json');
    echo json_encode($grouped);
}

function addEvent() {
    global $pdo;
    
    $serviceId = $_POST['service_id'] ?? '';
    $eventName = $_POST['event_name'] ?? '';
    $startTime = $_POST['start_time'] ?? '';
    $duration = $_POST['duration'] ?? '00:30:00';
    $eventDesc = $_POST['event_desc'] ?? '';
    
    if (!$serviceId || !$eventName || !$startTime) {
        echo json_encode(['success' => false, 'message' => 'Missing required fields']);
        return;
    }
    
    // Generate unique event ID
    $eventId = '0x' . strtoupper(dechex(rand(0x1000, 0xFFFF)));
    
    // Get service name
    $stmt = $pdo->prepare("SELECT service_name FROM services WHERE service_id = ?");
    $stmt->execute([$serviceId]);
    $service = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$service) {
        echo json_encode(['success' => false, 'message' => 'Invalid service ID']);
        return;
    }
    
    try {
        $stmt = $pdo->prepare("INSERT INTO events (event_id, service_id, service_name, start_time, duration, event_name, event_desc) 
                               VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $eventId,
            $serviceId,
            $service['service_name'],
            $startTime,
            $duration,
            $eventName,
            $eventDesc
        ]);
        
        logUpdate("Event added: $eventName");
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
    }
}

function updateEvent() {
    global $pdo;
    
    $eventId = $_POST['event_id'] ?? '';
    $serviceId = $_POST['service_id'] ?? '';
    $eventName = $_POST['event_name'] ?? '';
    $startTime = $_POST['start_time'] ?? '';
    $duration = $_POST['duration'] ?? '';
    $eventDesc = $_POST['event_desc'] ?? '';
    
    if (!$eventId || !$serviceId) {
        echo json_encode(['success' => false, 'message' => 'Missing event ID or service ID']);
        return;
    }
    
    try {
        $stmt = $pdo->prepare("UPDATE events SET event_name = ?, start_time = ?, duration = ?, event_desc = ? 
                               WHERE event_id = ? AND service_id = ?");
        $stmt->execute([
            $eventName,
            $startTime,
            $duration,
            $eventDesc,
            $eventId,
            $serviceId
        ]);
        
        logUpdate("Event updated: $eventName");
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
    }
}

function deleteEvent() {
    global $pdo;
    
    $eventId = $_POST['event_id'] ?? '';
    $serviceId = $_POST['service_id'] ?? '';
    
    if (!$eventId || !$serviceId) {
        echo json_encode(['success' => false, 'message' => 'Missing event ID or service ID']);
        return;
    }
    
    try {
        $stmt = $pdo->prepare("DELETE FROM events WHERE event_id = ? AND service_id = ?");
        $stmt->execute([$eventId, $serviceId]);
        
        logUpdate("Event deleted: $eventId");
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
    }
}

function logUpdate($message) {
    $logFile = '/var/log/job.log';
    $timestamp = date('Y-m-d H:i:s');
    $logMessage = "[$timestamp] Manual update: $message\n";
    
    file_put_contents($logFile, $logMessage, FILE_APPEND);
}
?>
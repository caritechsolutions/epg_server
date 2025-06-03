# EPG Management System

## Overview
This web-based EPG (Electronic Program Guide) management system provides a comprehensive interface for managing TV channel schedules and events.

## Features
- **Status Dashboard**: View when EPG was last updated and when cleanup was performed
- **Channel Grid View**: Visual timeline showing all channels and their events
- **Event Management**: Click on any event to edit or delete it
- **Add Events**: Click on empty time slots to add new events
- **Real-time Updates**: Automatic refresh of status information
- **Responsive Design**: Works on desktop and mobile devices

## Installation

### 1. Database Setup
First, create the tracking table in your existing database:

```sql
CREATE TABLE IF NOT EXISTS epg_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL,
    action_details TEXT,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'success',
    error_message TEXT,
    INDEX idx_action_type (action_type),
    INDEX idx_executed_at (executed_at)
);
```

### 2. File Setup
Place the following files in your web directory (e.g., `/var/www/html/`):
- `epg-dashboard.html` - Main dashboard interface
- `epg-styles.css` - Stylesheet
- `epg-dashboard.js` - JavaScript functionality
- `epg-api.php` - Backend API

### 3. Update Existing Scripts
Modify your existing scripts to log to the tracking table:

#### In `fill_epg.php`, add at the beginning:
```php
// Log start of update
try {
    $stmt = $conn->prepare("INSERT INTO epg_tracking (action_type, action_details) VALUES ('epg_update', ?)");
    $stmt->execute(["Starting EPG update for transport: $transportname"]);
} catch (PDOException $e) {
    error_log("EPG Tracking Error: " . $e->getMessage());
}
```

And at the end:
```php
// Log completion
try {
    $stmt = $conn->prepare("INSERT INTO epg_tracking (action_type, action_details) VALUES ('epg_update', ?)");
    $stmt->execute(["Completed EPG update for transport: $transportname. Added $t events, skipped $s events"]);
} catch (PDOException $e) {
    error_log("EPG Tracking Error: " . $e->getMessage());
}
```

#### In `epg_cleanup.php`, add similar logging:
```php
// At start
$stmt = $conn->prepare("INSERT INTO epg_tracking (action_type, action_details) VALUES ('cleanup', 'Starting EPG cleanup')");
$stmt->execute();

// After successful cleanup
$affectedRows = $conn->affected_rows;
$stmt = $conn->prepare("INSERT INTO epg_tracking (action_type, action_details) VALUES ('cleanup', ?)");
$stmt->execute(["Cleanup completed. Deleted $affectedRows old entries"]);
```

### 4. Access the Dashboard
Navigate to `http://your-server/epg-dashboard.html`

## Usage

### Viewing the EPG
1. The dashboard shows the current status at the top
2. Use the date picker to navigate to different days
3. Use the channel filter to view specific channels
4. The grid shows 24 hours with events displayed in their time slots

### Managing Events
1. **Edit Event**: Click on any event in the grid to edit its details
2. **Add Event**: Click the "Add Event" button or click on an empty time slot
3. **Delete Event**: Open an event and click the Delete button
4. **Save Changes**: All changes are saved immediately to the database

### Understanding the Status Cards
- **Last EPG Update**: Shows when the EPG data was last imported from transport streams
- **Last Cleanup**: Shows when old events were last removed from the database
- **Database Status**: Shows the total number of events currently in the system

## Customization

### Changing Colors
Edit `epg-styles.css` and modify the color variables:
```css
.dashboard-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
```

### Adding More Channels
Channels are automatically loaded from the `services` table in your database.

### Modifying Time Slots
To change from hourly to half-hourly slots, modify the grid generation in `epg-dashboard.js`.

## Troubleshooting

### No Data Showing
1. Check database connection in `epg-api.php`
2. Ensure the `events` and `services` tables exist
3. Check browser console for JavaScript errors

### Tracking Not Working
If the tracking table doesn't exist, the system will fall back to reading the log file at `/var/log/job.log`.

### Permission Issues
Ensure the web server has:
- Read access to `/var/log/job.log`
- Write access to the database
- Execute permission on PHP files

## Security Notes
1. Add authentication to protect the dashboard
2. Validate all user inputs
3. Use prepared statements (already implemented)
4. Consider adding CSRF protection for forms

## Future Enhancements
- Batch event operations
- Event templates
- Conflict detection
- Export functionality
- Email notifications
- API for external systems

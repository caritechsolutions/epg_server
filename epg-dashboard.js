$(document).ready(function() {
    let currentDate = new Date();
    let channels = [];
    let currentEditingEvent = null;

    // Initialize
    init();

    function init() {
        setCurrentDate();
        loadStatus();
        loadChannels();
        loadEPGData();
        bindEvents();
        updateCurrentTimeIndicator();
        
        // Refresh data every minute
        setInterval(loadStatus, 60000);
        setInterval(updateCurrentTimeIndicator, 60000);
    }

    function setCurrentDate() {
        $('#epg-date').val(formatDateForInput(currentDate));
    }

    function formatDateForInput(date) {
        return date.toISOString().split('T')[0];
    }

    function formatDateTime(dateStr) {
        if (!dateStr) return 'Never';
        const date = new Date(dateStr);
        return date.toLocaleString();
    }

    function formatTimeAgo(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minutes ago`;
        if (diffHours < 24) return `${diffHours} hours ago`;
        return `${diffDays} days ago`;
    }

    function loadStatus() {
        $.ajax({
            url: 'epg-api.php',
            method: 'GET',
            data: { action: 'get_status' },
            success: function(response) {
                $('#last-update-time').text(formatDateTime(response.last_update));
                $('#update-details').text(formatTimeAgo(response.last_update));
                $('#last-cleanup-time').text(formatDateTime(response.last_cleanup));
                $('#cleanup-details').text(formatTimeAgo(response.last_cleanup));
                $('#event-count').text(response.event_count);
            }
        });
    }

    function loadChannels() {
        $.ajax({
            url: 'epg-api.php',
            method: 'GET',
            data: { action: 'get_channels' },
            success: function(response) {
                channels = response;
                populateChannelSelects();
            }
        });
    }

    function populateChannelSelects() {
        const channelFilter = $('#channel-filter');
        const eventChannel = $('#event-channel');
        
        channelFilter.empty().append('<option value="">All Channels</option>');
        eventChannel.empty().append('<option value="">Select Channel</option>');
        
        channels.forEach(channel => {
            const option = `<option value="${channel.service_id}">${channel.service_name}</option>`;
            channelFilter.append(option);
            eventChannel.append(option);
        });
    }

    function loadEPGData() {
        showLoading();
        const selectedChannel = $('#channel-filter').val();
        const dateStr = $('#epg-date').val();
        
        $.ajax({
            url: 'epg-api.php',
            method: 'GET',
            data: { 
                action: 'get_epg',
                date: dateStr,
                channel: selectedChannel
            },
            success: function(response) {
                renderEPGGrid(response);
                updateCurrentTimeIndicator();
                hideLoading();
            },
            error: function() {
                hideLoading();
                alert('Error loading EPG data');
            }
        });
    }

    function renderEPGGrid(data) {
        const grid = $('#epg-grid');
        grid.empty();
        
        // Debug mode - uncomment to see grid structure
        // console.log('Rendering EPG Grid with data:', data);
        
        // Get the selected date for comparison
        const selectedDateStr = $('#epg-date').val();
        const selectedDate = new Date(selectedDateStr + 'T00:00:00');
        
        // Add time headers in the first row
        grid.append('<div class="epg-header epg-header-channel" style="grid-column: 1; grid-row: 1;">Channel</div>');
        for (let hour = 0; hour < 24; hour++) {
            grid.append(`<div class="epg-header" style="grid-column: ${hour + 2}; grid-row: 1;">${hour.toString().padStart(2, '0')}:00</div>`);
        }
        
        // Sort channels by service_id or name for consistent ordering
        const sortedChannelIds = Object.keys(data).sort((a, b) => {
            const channelA = channels.find(ch => ch.service_id == a);
            const channelB = channels.find(ch => ch.service_id == b);
            if (!channelA || !channelB) return 0;
            return channelA.service_name.localeCompare(channelB.service_name);
        });
        
        // Add channels and events - each channel gets its own row
        let currentRow = 2; // Start from row 2 (row 1 is headers)
        
        sortedChannelIds.forEach(channelId => {
            const channel = channels.find(ch => ch.service_id == channelId);
            if (!channel) return;
            
            // Debug - log channel and row
            // console.log(`Rendering channel ${channel.service_name} in row ${currentRow}`);
            
            // Add channel name in first column of current row
            grid.append(`<div class="epg-channel" style="grid-column: 1; grid-row: ${currentRow};">${channel.service_name}</div>`);
            
            // Process events for this channel
            const events = data[channelId] || [];
            events.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
            
            // Track which hours have been filled for this channel
            const hoursFilled = new Array(24).fill(false);
            
            // Add all events for this channel in the same row
            events.forEach(event => {
                const eventStart = new Date(event.start_time);
                const duration = parseDuration(event.duration);
                const eventEnd = new Date(eventStart.getTime() + duration * 60 * 1000);
                
                // Calculate start hour for this day
                let startHour = 0;
                if (eventStart >= selectedDate) {
                    startHour = eventStart.getHours();
                } else {
                    // Event started yesterday, starts at 00:00 today
                    startHour = 0;
                }
                
                // Calculate end hour for this day
                let endHour = 24;
                const nextDay = new Date(selectedDate);
                nextDay.setDate(nextDay.getDate() + 1);
                
                if (eventEnd < nextDay) {
                    endHour = Math.ceil((eventEnd - selectedDate) / (1000 * 60 * 60));
                }
                
                // Calculate actual span hours
                let spanHours = 0;
                for (let h = startHour; h < endHour && h < 24; h++) {
                    if (!hoursFilled[h]) {
                        spanHours++;
                        hoursFilled[h] = true;
                    }
                }
                
                if (spanHours > 0) {
                    // Calculate grid column position
                    const gridColumn = startHour + 2; // +2 because first column is channel name
                    
                    // Debug - log event position
                    // console.log(`Event "${event.event_name}" at column ${gridColumn}, span ${spanHours}, row ${currentRow}`);
                    
                    // Escape event data for safe HTML attribute
                    const eventDataEscaped = JSON.stringify(event).replace(/"/g, '&quot;');
                    
                    const eventElement = $(`
                        <div class="epg-event" 
                             style="grid-column: ${gridColumn} / span ${spanHours}; grid-row: ${currentRow};"
                             data-event="${eventDataEscaped}"
                             title="${event.event_name} - ${formatTime(event.start_time)}">
                            <div class="epg-event-title">${event.event_name}</div>
                            <div class="epg-event-time">${formatTime(event.start_time)} - ${formatEndTime(event.start_time, event.duration)}</div>
                        </div>
                    `);
                    
                    grid.append(eventElement);
                }
            });
            
            // Fill empty slots for this channel in the same row
            for (let hour = 0; hour < 24; hour++) {
                if (!hoursFilled[hour]) {
                    const gridColumn = hour + 2; // +2 because first column is channel name
                    grid.append(`
                        <div class="epg-empty" 
                             style="grid-column: ${gridColumn}; grid-row: ${currentRow};"
                             data-channel="${channelId}" 
                             data-hour="${hour}"
                             title="Click to add event at ${hour.toString().padStart(2, '0')}:00">
                            <i class="fas fa-plus"></i>
                        </div>
                    `);
                }
            }
            
            // Move to next row for next channel
            currentRow++;
        });
        
        // Debug - log final grid structure
        // console.log(`Grid rendered with ${currentRow - 1} rows total`);
    }

    function parseDuration(duration) {
        const parts = duration.split(':');
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }

    function formatTime(datetime) {
        const date = new Date(datetime);
        return date.toTimeString().substring(0, 5);
    }
    
    function formatEndTime(startTime, duration) {
        const start = new Date(startTime);
        const durationMs = parseDuration(duration) * 60 * 1000;
        const end = new Date(start.getTime() + durationMs);
        return end.toTimeString().substring(0, 5);
    }

    function showLoading() {
        $('#loading-overlay').css('display', 'flex');
    }

    function hideLoading() {
        $('#loading-overlay').hide();
    }

    function updateCurrentTimeIndicator() {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentDateStr = formatDateForInput(now);
        const selectedDateStr = $('#epg-date').val();
        
        // Only show indicator if viewing today
        if (currentDateStr === selectedDateStr) {
            const gridOffset = 200; // Channel column width
            const hourWidth = $('.epg-header:eq(1)').outerWidth() || 120;
            const position = gridOffset + (currentHour * hourWidth) + ((currentMinute / 60) * hourWidth);
            
            let indicator = $('.current-time-indicator');
            if (indicator.length === 0) {
                indicator = $('<div class="current-time-indicator"></div>');
                $('.epg-grid-container').append(indicator);
            }
            
            indicator.css('left', position + 'px').show();
            
            // Highlight current events
            $('.epg-event').removeClass('now-playing');
            $('.epg-event').each(function() {
                const eventData = $(this).attr('data-event');
                try {
                    const event = JSON.parse(eventData.replace(/&quot;/g, '"'));
                    const eventStart = new Date(event.start_time);
                    const duration = parseDuration(event.duration);
                    const eventEnd = new Date(eventStart.getTime() + duration * 60000);
                    
                    if (now >= eventStart && now < eventEnd) {
                        $(this).addClass('now-playing');
                    }
                } catch (e) {}
            });
        } else {
            $('.current-time-indicator').hide();
            $('.epg-event').removeClass('now-playing');
        }
    }

    function openEventModal(event = null, channelId = null, hour = null) {
        currentEditingEvent = event;
        
        if (event) {
            $('#modal-title').text('Edit Event');
            $('#event-id').val(event.event_id);
            $('#service-id').val(event.service_id);
            $('#event-channel').val(event.service_id).prop('disabled', true);
            $('#event-name').val(event.event_name);
            
            const date = new Date(event.start_time);
            $('#event-date').val(formatDateForInput(date));
            $('#event-start').val(formatTime(event.start_time));
            $('#event-duration').val(event.duration.substring(0, 5));
            $('#event-desc').val(event.event_desc);
            $('#delete-event').show();
        } else {
            $('#modal-title').text('Add Event');
            $('#event-id').val('');
            $('#service-id').val('');
            $('#event-channel').prop('disabled', false);
            $('#event-name').val('');
            $('#event-desc').val('');
            $('#delete-event').hide();
            
            if (channelId && hour !== null) {
                $('#event-channel').val(channelId);
                const date = new Date($('#epg-date').val());
                $('#event-date').val(formatDateForInput(date));
                $('#event-start').val(`${hour.toString().padStart(2, '0')}:00`);
            } else {
                $('#event-date').val($('#epg-date').val());
                $('#event-start').val('');
            }
            $('#event-duration').val('00:30');
        }
        
        $('#event-modal').show();
    }

    function closeEventModal() {
        $('#event-modal').hide();
        currentEditingEvent = null;
    }

    function saveEvent() {
        const eventData = {
            event_id: $('#event-id').val(),
            service_id: $('#event-channel').val(),
            event_name: $('#event-name').val(),
            start_time: $('#event-date').val() + ' ' + $('#event-start').val() + ':00',
            duration: $('#event-duration').val() + ':00',
            event_desc: $('#event-desc').val()
        };
        
        const action = eventData.event_id ? 'update_event' : 'add_event';
        
        showLoading();
        $.ajax({
            url: 'epg-api.php',
            method: 'POST',
            data: { 
                action: action,
                ...eventData
            },
            success: function(response) {
                if (response.success) {
                    closeEventModal();
                    loadEPGData();
                } else {
                    alert('Error saving event: ' + response.message);
                }
                hideLoading();
            },
            error: function() {
                alert('Error saving event');
                hideLoading();
            }
        });
    }

    function deleteEvent() {
        if (!confirm('Are you sure you want to delete this event?')) return;
        
        showLoading();
        $.ajax({
            url: 'epg-api.php',
            method: 'POST',
            data: { 
                action: 'delete_event',
                event_id: $('#event-id').val(),
                service_id: $('#service-id').val()
            },
            success: function(response) {
                if (response.success) {
                    closeEventModal();
                    loadEPGData();
                } else {
                    alert('Error deleting event: ' + response.message);
                }
                hideLoading();
            },
            error: function() {
                alert('Error deleting event');
                hideLoading();
            }
        });
    }

    function bindEvents() {
        // Navigation
        $('#prev-day').click(function() {
            currentDate.setDate(currentDate.getDate() - 1);
            setCurrentDate();
            loadEPGData();
        });
        
        $('#next-day').click(function() {
            currentDate.setDate(currentDate.getDate() + 1);
            setCurrentDate();
            loadEPGData();
        });
        
        $('#today-btn').click(function() {
            currentDate = new Date();
            setCurrentDate();
            loadEPGData();
        });
        
        $('#epg-date').change(function() {
            currentDate = new Date($(this).val());
            loadEPGData();
        });
        
        $('#channel-filter').change(loadEPGData);
        
        $('#refresh-btn').click(function() {
            loadStatus();
            loadEPGData();
        });
        
        // Modal
        $('#add-event-btn').click(function() {
            openEventModal();
        });
        
        $('.close-btn, .btn-cancel').click(closeEventModal);
        
        $('#event-form').submit(function(e) {
            e.preventDefault();
            saveEvent();
        });
        
        $('#delete-event').click(deleteEvent);
        
        // Click outside modal to close
        $('#event-modal').click(function(e) {
            if (e.target === this) {
                closeEventModal();
            }
        });
        
        // EPG Grid events with improved handling
        $(document).on('click', '.epg-event', function(e) {
            e.stopPropagation();
            const eventData = $(this).attr('data-event');
            try {
                const event = JSON.parse(eventData.replace(/&quot;/g, '"'));
                openEventModal(event);
            } catch (error) {
                console.error('Error parsing event data:', error);
            }
        });
        
        $(document).on('click', '.epg-empty', function(e) {
            e.stopPropagation();
            const channelId = $(this).data('channel');
            const hour = $(this).data('hour');
            openEventModal(null, channelId, hour);
        });
        
        // Add hover effect for better visibility
        $(document).on('mouseenter', '.epg-event', function() {
            $(this).css('z-index', '20');
        }).on('mouseleave', '.epg-event', function() {
            $(this).css('z-index', '');
        });
        
        // Add keyboard navigation
        $(document).on('keydown', '.epg-event, .epg-empty', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                $(this).click();
            }
        });
    }
});
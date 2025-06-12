// script.js

// IMPORTANT: Assuming GEMINI_API_KEY is defined in config.js
// and config.js is loaded BEFORE script.js in your HTML.

// Stores all dynamic data for the chatbot and dashboard
let appState = {
    questionsAnswered: 0,
    studyStreak: 1,
    dailyGoal: 10,
    tasks: [],
    reminders: [],
    chatHistory: []
};

// --- 3D Background Initialization (Three.js Particles) ---
function initParticles() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0); // Transparent background for overlay
    document.getElementById('particles').appendChild(renderer.domElement);

    // Create particles for the background
    const geometry = new THREE.BufferGeometry();
    const particleCount = 150;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
        // Distribute particles randomly in a 3D space
        positions[i * 3] = (Math.random() - 0.5) * 40;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 40;

        // Assign random colors, favoring blue/purple hues for a techy look
        colors[i * 3] = Math.random() * 0.5 + 0.5;
        colors[i * 3 + 1] = Math.random() * 0.5 + 0.5;
        colors[i * 3 + 2] = 1;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 0.1,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    camera.position.z = 10; // Position the camera in front of the particles

    // Animation loop for particles
    function animate() {
        requestAnimationFrame(animate); // Request next animation frame

        // Rotate particles slowly
        particles.rotation.x += 0.0005;
        particles.rotation.y += 0.001;

        // Move particles slightly forward for continuous flow
        particles.position.z += 0.005;

        // Reset particle position for infinite loop effect
        if (particles.position.z > 15) {
            particles.position.z = -20;
        }

        renderer.render(scene, camera); // Render the scene
    }
    animate();

    // Handle window resizing
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// --- Gemini API Integration ---

// Sends user prompts to the Gemini API and gets a response
async function callGeminiAPI(prompt) {
    // Check if the API key is available
    if (typeof GEMINI_API_KEY === 'undefined' || !GEMINI_API_KEY) {
        return "I'm sorry, I can't connect to my knowledge base. My API key is missing. Please ensure your config.js file is correctly set up.";
    }

    const API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    // Add user's current message to chat history for conversational context
    appState.chatHistory.push({ role: "user", parts: [{ text: prompt }] });

    // Limit chat history sent to the API
    if (appState.chatHistory.length > 10) {
        appState.chatHistory = appState.chatHistory.slice(-10); // Retain only the most recent messages
    }

    try {
        // Send a POST request to the Gemini API
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: appState.chatHistory, // Pass chat history for context
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 500,
                },
                safetySettings: [ // Configure safety filters
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
                ],
            })
        });

        // Check if the API request was successful
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorData.error.message || 'Unknown error'}`);
        }

        const data = await response.json();

        let geminiText = "I'm sorry, I couldn't generate a response for that. Please try rephrasing.";
        // Extract the generated text from the API response
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts) {
            geminiText = data.candidates[0].content.parts.map(part => part.text).join(' ');
        } else if (data.promptFeedback && data.promptFeedback.blockReason) {
            // Handle cases where the user's prompt was blocked
            geminiText = "I cannot respond to that query due to safety guidelines. Please try a different question.";
        }

        // Add the bot's response to the chat history
        appState.chatHistory.push({ role: "model", parts: [{ text: geminiText }] });

        return geminiText; // Return the generated text
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return "Oops! I'm having trouble connecting to my knowledge base. Please check your internet connection or try again later. (Error: " + error.message + ")";
    }
}

// Determines whether to handle a message locally or send it to Gemini
async function getAIResponse(userMessage) {
    const message = userMessage.toLowerCase();

    // Prioritize IntelliBot's specific functionalities (progress, tasks, reminders, study tips)
    if (message.includes('progress') || message.includes('how am i doing') || message.includes('my stats')) {
        return generateProgressResponse();
    } else if (message.includes('add task')) {
        return "To add a task, please use the 'Add Task' input field in the Study Tasks section. You can type your task there and click 'Add Task'.";
    } else if (message.includes('set reminder')) {
        return "To set a reminder, please use the 'Reminders' section. Input the time and your reminder message, then click 'Set Reminder'.";
    } else if (message.includes('study tip') || message.includes('learn better') || message.includes('remember more')) {
        // Provide a random study tip
        return generateStudyTipResponse();
    }
    // For all other questions, send to the Gemini API
    return await callGeminiAPI(userMessage);
}

// --- Chat Functionality ---
async function sendMessage() {
    const input = document.getElementById('chatInput');
    const sendButton = document.querySelector('.chat-input-container .send-btn');
    const message = input.value.trim();

    if (message === '') return;

    addMessageToChat('user', message); // Display user's message
    input.value = ''; // Clear input field

    showTypingIndicator(); // Show "IntelliBot is typing..."

    try {
        // Disable input and send button
        input.disabled = true;
        if (sendButton) {
            sendButton.disabled = true;
        }

        const aiResponse = await getAIResponse(message); // Get AI's response

        hideTypingIndicator(); // Hide typing indicator
        addMessageToChat('bot', aiResponse); // Display AI's response

        // Update questions answered if it was a general AI response
        const lowerCaseMessage = message.toLowerCase();
        if (!lowerCaseMessage.includes('progress') && !lowerCaseMessage.includes('add task') && !lowerCaseMessage.includes('set reminder')) {
            appState.questionsAnswered++;
            updateProgress(); // Update progress display
        }

    } catch (error) {
        hideTypingIndicator(); // Hide typing indicator on error
        addMessageToChat('bot', "An error occurred while getting a response. Please try again.");
        console.error("Error sending message:", error);
    } finally {
        // Always re-enable input and send button
        input.disabled = false;
        if (sendButton) {
            sendButton.disabled = false;
        }
        input.focus(); // Keep focus on input field
    }
}

// Adds a message to the chat display
function addMessageToChat(sender, message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;

    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';

    // Use marked.parse() for bot messages to render Markdown
    bubbleDiv.innerHTML = (sender === 'bot') ? marked.parse(message) : message;

    messageDiv.appendChild(bubbleDiv);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll to latest message
}

// Shows the typing indicator
function showTypingIndicator() {
    document.getElementById('typingIndicator').style.display = 'block';
}

// Hides the typing indicator
function hideTypingIndicator() {
    document.getElementById('typingIndicator').style.display = 'none';
}

// Handles Enter key press in the chat input
function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// --- Progress Tracking ---
function updateProgress() {
    const progress = Math.min((appState.questionsAnswered / appState.dailyGoal) * 100, 100);
    document.getElementById('dailyProgress').style.width = progress + '%';
    document.getElementById('progressText').textContent = `${Math.round(progress)}% Complete Today`;
    document.getElementById('questionsAnswered').textContent = appState.questionsAnswered;
    document.getElementById('studyStreak').textContent = appState.studyStreak;
}

// Generates a dynamic response about the user's progress
function generateProgressResponse() {
    const completionPercentage = Math.round((appState.questionsAnswered / appState.dailyGoal) * 100);
    let response = `You've answered **${appState.questionsAnswered}** questions today, achieving **${completionPercentage}%** of your daily goal. `;
    if (appState.questionsAnswered >= appState.dailyGoal) {
        response += "Fantastic job! You've met your daily goal! 🎉";
    } else {
        response += `Keep going! You need **${appState.dailyGoal - appState.questionsAnswered}** more questions to reach your goal.`;
    }
    response += ` Your current study streak is **${appState.studyStreak}** days.`;
    return response;
}

// Provides a random study tip
function generateStudyTipResponse() {
    const tips = [
        "Here's a great study tip: Use the **Pomodoro Technique** - study for 25 minutes, then take a 5-minute break. This helps maintain focus and prevents burnout! 🍅",
        "For better retention, try the **spaced repetition method**: review material at increasing intervals (1 day, 3 days, 1 week, 2 weeks). 🧠",
        "**Active recall** is key! Instead of just re-reading notes, test yourself by explaining concepts out loud or writing them from memory. ✍️",
        "Create **mind maps** to visualize connections between concepts. This helps with understanding complex relationships in your subjects. 🗺️",
        "Ensure you get enough **sleep**! Quality sleep is crucial for memory consolidation and learning. 😴"
    ];
    return tips[Math.floor(Math.random() * tips.length)];
}

// --- Task Management ---
function addTask() {
    const input = document.getElementById('taskInput');
    const task = input.value.trim();

    if (task === '') return;

    appState.tasks.push({
        id: Date.now(), // Unique ID for the task
        text: task,
        completed: false // Task is initially not completed
    });

    input.value = ''; // Clear input field
    renderTasks();    // Update the displayed task list
}

function renderTasks() {
    const taskList = document.getElementById('taskList');
    taskList.innerHTML = ''; // Clear existing tasks before rendering

    if (appState.tasks.length === 0) {
        taskList.innerHTML = '<p class="no-items">No tasks added yet. Get started by typing a task above!</p>';
        return;
    }

    appState.tasks.forEach(task => {
        const taskDiv = document.createElement('div');
        taskDiv.className = 'task-item';
        taskDiv.innerHTML = `
            <span style="${task.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${task.text}</span>
            <button class="btn btn-small" onclick="removeTask(${task.id})">Remove</button>
        `;

        // Add event listener to toggle task completion on click
        taskDiv.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON') {
                toggleTask(task.id);
            }
        });

        taskList.appendChild(taskDiv);
    });
}

function toggleTask(id) {
    const task = appState.tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed; // Toggle completion status
        renderTasks(); // Re-render tasks
    }
}

function removeTask(id) {
    appState.tasks = appState.tasks.filter(t => t.id !== id);
    renderTasks(); // Re-render tasks
}

// --- Reminder System ---
function setReminder() {
    const time = document.getElementById('reminderTime').value;
    const text = document.getElementById('reminderText').value.trim();

    if (time === '' || text === '') {
        alert('Please fill in both time and reminder message to set a reminder.');
        return;
    }

    const reminder = {
        id: Date.now(), // Unique ID for the reminder
        time: time,
        text: text,
        set: false
    };
    appState.reminders.push(reminder);

    document.getElementById('reminderTime').value = ''; // Clear time input
    document.getElementById('reminderText').value = ''; // Clear text input
    renderReminders();    // Update the displayed reminders list
    scheduleReminder(reminder); // Schedule the browser notification
}

function renderReminders() {
    const reminderList = document.getElementById('reminderList');
    reminderList.innerHTML = ''; // Clear existing reminders

    if (appState.reminders.length === 0) {
        reminderList.innerHTML = '<p class="no-items">No reminders set yet. Add one above!</p>';
        return;
    }

    appState.reminders.forEach(reminder => {
        const reminderDiv = document.createElement('div');
        reminderDiv.className = 'task-item'; // Re-use styling
        reminderDiv.innerHTML = `
            <div>
                <strong>${reminder.time}</strong><br>
                <small>${reminder.text}</small>
            </div>
            <button class="btn btn-small" onclick="removeReminder(${reminder.id})">Remove</button>
        `;
        reminderList.appendChild(reminderDiv);
    });
}

function removeReminder(id) {
    appState.reminders = appState.reminders.filter(r => r.id !== id);
    renderReminders(); // Re-render reminders
}

function scheduleReminder(reminder) {
    const now = new Date();
    const [hours, minutes] = reminder.time.split(':').map(Number);
    let reminderDateTime = new Date();
    reminderDateTime.setHours(hours, minutes, 0, 0);

    // If reminder time for today has already passed, schedule for tomorrow
    if (reminderDateTime <= now) {
        reminderDateTime.setDate(reminderDateTime.getDate() + 1);
    }

    const timeUntilReminder = reminderDateTime.getTime() - now.getTime();

    setTimeout(() => {
        // Check for Notification API permission
        if (Notification.permission === 'granted') {
            new Notification('IntelliBot Reminder', {
                body: reminder.text,
                icon: '🤖'
            });
        } else {
            // Fallback to alert if notifications are not granted
            alert(`IntelliBot Reminder: ${reminder.text}`);
        }

        addMessageToChat('bot', `⏰ Reminder: ${reminder.text}`); // Add reminder to chat
    }, timeUntilReminder);
}

// --- App Initialization ---
function initApp() {
    // Initialize all components of the IntelliBot
    initParticles();
    updateProgress();
    renderTasks();
    renderReminders();

    // Request Notification API permission
    if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log("Notification permission granted for IntelliBot.");
            } else {
                console.warn("Notification permission denied for IntelliBot.");
            }
        });
    }

    // Initial welcome message from IntelliBot
    addMessageToChat('bot', 'Hello! I\'m IntelliBot, your AI study assistant. I can help you with academic questions, track your progress, and manage your study schedule. What would you like to know today?');
}

// Start the IntelliBot application once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initApp);
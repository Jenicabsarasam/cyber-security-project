let csrfToken = "";
async function fetchCSRFToken() {
    try {
        const res = await fetch('/csrf-token');
        const data = await res.json();
        csrfToken = data.csrf_token;
    } catch (err) {
        console.error("CSRF fetch failed", err);
    }
}
// Helper function to show error messages in the UI instead of alerts
function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 4000);
    } else {
        // Fallback to alert if error element not found
        alert(message);
    }
}

// Helper function to show success messages
function showSuccess(message) {
    // Check if we're on dashboard (show toast notification)
    if (document.querySelector('.container')) {
        const toast = document.createElement('div');
        toast.className = 'success-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 3000);
    } else {
        alert(message);
    }
}

// Helper to set button loading state
function setButtonLoading(button, isLoading, originalText) {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.textContent = originalText || button.textContent;
        button.style.opacity = '0.7';
    } else {
        button.disabled = false;
        button.textContent = originalText || button.textContent;
        button.style.opacity = '1';
    }
}

async function signup() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
    const button = event.target;
    const originalText = button.textContent;

    // Validation
    if (!username || !password) {
        showError('error', '⚠️ All fields are required');
        return;
    }

    if (password.length < 6) {
        showError('error', '⚠️ Password must be at least 6 characters');
        return;
    }

    if (!/\d/.test(password)) {
        showError('error', '⚠️ Password must contain at least one number');
        return;
    }

    setButtonLoading(button, true, 'Creating account...');

    try {
        const res = await fetch('/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (data.message) {
            await fetchCSRFToken();
            showSuccess('✅ Account created successfully! Redirecting to login...');
            setTimeout(() => {
                location.href = "/";
            }, 1500);
        } else {
            showError('error', data.error || '❌ Signup failed. Please try again.');
        }
    } catch (error) {
        showError('error', '❌ Network error. Please check your connection.');
    } finally {
        setButtonLoading(button, false, originalText);
    }
}

async function login() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
    const button = event.target;
    const originalText = button.textContent;

    if (!username || !password) {
        showError('error', '⚠️ Please enter both username and password');
        return;
    }

    setButtonLoading(button, true, 'Logging in...');

    try {
        const res = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (data.message) {
            showSuccess('✅ Login successful! Redirecting to dashboard...');
            setTimeout(() => {
                location.href = "/dashboard";
            }, 800);
        } else {
            showError('error', data.error || '❌ Invalid username or password');
        }
    } catch (error) {
        showError('error', '❌ Network error. Please try again.');
    } finally {
        setButtonLoading(button, false, originalText);
    }
}

async function addNote() {
    const noteInput = document.getElementById("note");
    const content = noteInput.value.trim();
    const button = event.target;
    const originalText = button.textContent;

    if (!content) {
        showError('error', '⚠️ Please write something before adding');
        return;
    }

    setButtonLoading(button, true, 'Saving...');

    try {
        const res = await fetch('/add_note', {
            method: 'POST',
            headers: { 
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken
},
            body: JSON.stringify({ content })
        });

        const data = await res.json();

        if (data.message) {
            showSuccess('✅ Note added successfully!');
            noteInput.value = "";
            await loadNotes();
        } else {
            showError('error', data.error || '❌ Failed to add note');
        }
    } catch (error) {
        showError('error', '❌ Network error. Please try again.');
    } finally {
        setButtonLoading(button, false, originalText);
    }
}

async function loadNotes() {
    const list = document.getElementById("list");
    
    // Show loading state
    if (list) {
        list.innerHTML = '<li style="text-align: center; color: #9ca3af;">📖 Loading your notes...</li>';
    }

    try {
        const res = await fetch('/notes');

        if (res.status === 401) {
            showError('error', '🔒 Session expired. Redirecting to login...');
            setTimeout(() => {
                location.href = "/";
            }, 1500);
            return;
        }

        if (!res.ok) {
            throw new Error('Failed to load notes');
        }

        const data = await res.json();
        
        if (!list) return;
        
        list.innerHTML = "";

        if (data.length === 0) {
            list.innerHTML = '<li style="text-align: center; color: #9ca3af;">📝 No notes yet. Create your first note above!</li>';
            return;
        }

        data.forEach(n => {
            const li = document.createElement("li");
            li.style.animation = "fadeInUp 0.3s ease-out";
            
            const content = document.createElement("div");
            content.className = "note-content";
            content.innerText = n.content;
            
            const meta = document.createElement("div");
            meta.style.cssText = "display: flex; align-items: center; gap: 8px; margin-top: 8px;";
            
            const time = document.createElement("small");
            time.innerText = n.time;
            time.style.cssText = "color: #6b7280; font-size: 11px;";
            
            const buttonGroup = document.createElement("div");
            buttonGroup.style.cssText = "display: flex; gap: 8px; margin-top: 12px;";
            
            const editBtn = document.createElement("button");
            editBtn.innerText = "✏️ Edit";
            editBtn.className = "edit-btn";
            editBtn.style.cssText = "background: #10b981; padding: 6px 12px; font-size: 12px; width: auto; margin: 0;";
            editBtn.onclick = () => edit(n.id, n.content);
            
            const delBtn = document.createElement("button");
            delBtn.innerText = "🗑️ Delete";
            delBtn.className = "delete-btn";
            delBtn.style.cssText = "background: #ef4444; padding: 6px 12px; font-size: 12px; width: auto; margin: 0;";
            delBtn.onclick = () => del(n.id);
            
            buttonGroup.appendChild(editBtn);
            buttonGroup.appendChild(delBtn);
            meta.appendChild(time);
            
            li.appendChild(content);
            li.appendChild(meta);
            li.appendChild(buttonGroup);
            
            list.appendChild(li);
        });
    } catch (error) {
        console.error('Load notes error:', error);
        if (list) {
            list.innerHTML = '<li style="text-align: center; color: #ef4444;">❌ Error loading notes. Please refresh the page.</li>';
        }
    }
}

async function edit(id, oldText) {
    const newText = prompt("✏️ Edit your note:", oldText);
    
    if (!newText || newText === oldText) return;
    
    if (!newText.trim()) {
        alert("Note cannot be empty");
        return;
    }
    
    // Show loading state on the edit button
    const buttons = document.querySelectorAll('button');
    let editButton = null;
    for (let btn of buttons) {
        if (btn.textContent.includes('Edit') && btn.onclick.toString().includes(id)) {
            editButton = btn;
            break;
        }
    }
    
    if (editButton) {
        const originalText = editButton.textContent;
        editButton.textContent = '⏳ Saving...';
        editButton.disabled = true;
        
        try {
            const res = await fetch('/edit/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newText.trim() })
            });
            
            const data = await res.json();
            
            if (data.message) {
                showSuccess('✅ Note updated successfully!');
                await loadNotes();
            } else {
                alert(data.error || 'Failed to update note');
            }
        } catch (error) {
            alert('❌ Network error. Please try again.');
        } finally {
            editButton.textContent = originalText;
            editButton.disabled = false;
        }
    } else {
        // Fallback if button not found
        try {
            await fetch('/edit/' + id, {
                method: 'PUT',
                headers: { 
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken
},
                body: JSON.stringify({ content: newText.trim() })
            });
            await loadNotes();
        } catch (error) {
            alert('❌ Network error. Please try again.');
        }
    }
}

async function del(id) {
    // Confirm deletion
    if (!confirm('⚠️ Are you sure you want to delete this note? This action cannot be undone.')) {
        return;
    }
    
    // Find and disable the delete button
    const buttons = document.querySelectorAll('button');
    let deleteButton = null;
    for (let btn of buttons) {
        if (btn.textContent.includes('Delete') && btn.onclick && btn.onclick.toString().includes(id)) {
            deleteButton = btn;
            break;
        }
    }
    
    if (deleteButton) {
        const originalText = deleteButton.textContent;
        deleteButton.textContent = '⏳ Deleting...';
        deleteButton.disabled = true;
        
        try {
            const res = await fetch('/delete/' + id, { method: 'DELETE' });
            const data = await res.json();
            
            if (data.message) {
                showSuccess('✅ Note deleted successfully');
                await loadNotes();
            } else {
                alert(data.error || 'Failed to delete note');
                if (deleteButton) {
                    deleteButton.textContent = originalText;
                    deleteButton.disabled = false;
                }
            }
        } catch (error) {
            alert('❌ Network error. Please try again.');
            if (deleteButton) {
                deleteButton.textContent = originalText;
                deleteButton.disabled = false;
            }
        }
    } else {
        // Fallback if button not found
        try {
            await fetch('/delete/' + id, { 
    method: 'DELETE',
    headers: { 'X-CSRF-Token': csrfToken }
});
            await loadNotes();
        } catch (error) {
            alert('❌ Network error. Please try again.');
        }
    }
}

async function logout(event) {
    if (event) event.preventDefault();

    if (confirm('🚪 Are you sure you want to logout?')) {

        const logoutBtn = event ? event.target : null;
        const originalText = logoutBtn ? logoutBtn.textContent : '';

        if (logoutBtn) {
            logoutBtn.textContent = '⏳ Logging out...';
            logoutBtn.disabled = true;
        }

        try {
            await fetch('/logout', { method: 'POST' });

            showSuccess('👋 Logged out successfully!');

            // 🔥 IMPORTANT: force full reload (clears session properly)
            setTimeout(() => {
                window.location.href = "/";
            }, 500);

        } catch (error) {
            // fallback
            window.location.href = "/";
        }
    }
}

// Optional: Add enter key support for login/signup
document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const currentPage = window.location.pathname;
                if (currentPage === '/' || currentPage === '/login') {
                    login();
                } else if (currentPage === '/signup_page') {
                    signup();
                }
            }
        });
    }
    
    // Auto-focus on first input
    const firstInput = document.querySelector('input');
    if (firstInput) {
        firstInput.focus();
    }
});
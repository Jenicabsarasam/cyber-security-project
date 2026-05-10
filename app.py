from datetime import timedelta
from flask import Flask, request, jsonify, session, render_template
import sqlite3, datetime, os
import bcrypt
import time
import re
import secrets
from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY")
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = False
app.permanent_session_lifetime = timedelta(minutes=10)

cipher = Fernet(os.getenv("FERNET_KEY"))

app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

login_attempts = {}  
# format: { ip: {"count": int, "time": timestamp} }

# -------- DB --------
def get_db():
    return sqlite3.connect("database.db")

def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT UNIQUE,
        password BLOB
    )''')

    cur.execute('''CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        content BLOB,
        created_at TEXT
    )''')

    conn.commit()
    conn.close()

init_db()

# -------- PAGES --------
@app.route('/')
def login_page():
    return render_template("login.html")

@app.route('/signup_page')
def signup_page():
    return render_template("signup.html")

@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return "Unauthorized", 401
    return render_template("dashboard.html")
@app.route('/csrf-token')
def csrf_token():
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    return jsonify({"csrf_token": session.get('csrf_token')})

# -------- AUTH --------

def verify_csrf():
    token = request.headers.get("X-CSRF-Token")
    if not token or token != session.get("csrf_token"):
        return False
    return True
def is_strong_password(password):
    return (
        len(password) >= 8 and
        re.search(r"[A-Z]", password) and      # uppercase
        re.search(r"[a-z]", password) and      # lowercase
        re.search(r"\d", password) and         # digit
        re.search(r"[!@#$%^&*(),.?\":{}|<>]", password)  # special char
    )


@app.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()
    
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    # 🔴 Username validation
    if not username or len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters"}), 400

    # 🔴 Strong password validation
    if not is_strong_password(password):
        return jsonify({
            "error": "Password must be 8+ chars with uppercase, lowercase, number, and special character"
        }), 400

    # 🔐 Hash password
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            (username, hashed)
        )
        conn.commit()
        conn.close()
    except:
        return jsonify({"error": "User already exists"}), 400

    return jsonify({"message": "User created"})

@app.route('/login', methods=['POST'])
def login():
    ip = request.remote_addr
    now = time.time()

    # Initialize
    if ip not in login_attempts:
        login_attempts[ip] = {"count": 0, "time": now}

    attempt = login_attempts[ip]

    # 🔒 Lockout for 60 seconds
    if attempt["count"] >= 5 and (now - attempt["time"]) < 60:
        return jsonify({"error": "Too many attempts. Try again later.Wait 1 minute."}), 429

    # Reset after cooldown
    if (now - attempt["time"]) >= 60:
        login_attempts[ip] = {"count": 0, "time": now}

    data = request.get_json()
    username = data.get("username")
    password = data.get("password")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, password FROM users WHERE username = ?", (username,))
    user = cur.fetchone()
    conn.close()

    if not user or not bcrypt.checkpw(password.encode(), user[1]):
        login_attempts[ip]["count"] += 1
        login_attempts[ip]["time"] = now
        return jsonify({"error": "Invalid credentials"}), 401

    # Success → reset attempts
    

    session['csrf_token'] = secrets.token_hex(16)
    login_attempts[ip] = {"count": 0, "time": now}

    session.permanent = True
    session['user_id'] = user[0]

    return jsonify({
    "message": "Logged in",
    "csrf_token": session.get("csrf_token")
})
@app.route('/logout', methods=['GET', 'POST'])
def logout():
    session.clear()
    
    response = jsonify({"message": "Logged out"})
    
    # 🔥 Force cookie removal
    response.delete_cookie('session')
    
    return response

# -------- NOTES --------
@app.route('/add_note', methods=['POST'])
def add_note():
    
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    if not verify_csrf():
        return jsonify({"error": "CSRF detected"}), 403

    content = request.json.get("content")

    if not content or len(content) > 500:
        return jsonify({"error": "Invalid input"}), 400

    encrypted = cipher.encrypt(content.encode())
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO notes VALUES (NULL, ?, ?, ?)",
                (session['user_id'], encrypted, now))
    conn.commit()
    conn.close()

    return jsonify({"message": "Added"})

@app.route('/notes')
def get_notes():
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, content, created_at FROM notes WHERE user_id=?",
                (session['user_id'],))
    rows = cur.fetchall()
    conn.close()

    result = []
    for r in rows:
        result.append({
            "id": r[0],
            "content": cipher.decrypt(r[1]).decode(),
            "time": r[2]
        })

    return jsonify(result)

@app.route('/delete/<int:id>', methods=['DELETE'])
def delete_note(id):
    
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    if not verify_csrf():
        return jsonify({"error": "CSRF detected"}), 403

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT user_id FROM notes WHERE id=?", (id,))
    note = cur.fetchone()

    if not note or note[0] != session['user_id']:
        return jsonify({"error": "Forbidden"}), 403

    cur.execute("DELETE FROM notes WHERE id=?", (id,))
    conn.commit()
    conn.close()

    return jsonify({"message": "Deleted"})

@app.route('/edit/<int:id>', methods=['PUT'])
def edit_note(id):
    
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    if not verify_csrf():
        return jsonify({"error": "CSRF detected"}), 403

    content = request.json.get("content")

    if not content or len(content) > 500:
        return jsonify({"error": "Invalid input"}), 400

    encrypted = cipher.encrypt(content.encode())

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT user_id FROM notes WHERE id=?", (id,))
    note = cur.fetchone()

    if not note or note[0] != session['user_id']:
        return jsonify({"error": "Forbidden"}), 403

    cur.execute("UPDATE notes SET content=? WHERE id=?", (encrypted, id))
    conn.commit()
    conn.close()

    return jsonify({"message": "Updated"})

if __name__ == "__main__":
    app.run(debug=True)
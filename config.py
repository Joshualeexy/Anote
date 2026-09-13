import os

PORT = 5000

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "clipboards.json")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
PC_ROOT_DIR = os.path.expanduser("~")

DEFAULT_VIDEO_DIR = os.path.join(PC_ROOT_DIR, "face", "output")
if not os.path.isdir(DEFAULT_VIDEO_DIR):
    DEFAULT_VIDEO_DIR = os.path.join(PC_ROOT_DIR, "Videos")
    if not os.path.isdir(DEFAULT_VIDEO_DIR):
        DEFAULT_VIDEO_DIR = PC_ROOT_DIR

VIDEO_EXTS = ('.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v')
IMAGE_EXTS = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg')

os.makedirs(UPLOADS_DIR, exist_ok=True)

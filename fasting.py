import tkinter as tk
from tkinter import messagebox, simpledialog
import sqlite3
from datetime import datetime, timedelta
import time
import threading
import pygame
import os

class FastingApp:
    def __init__(self, root):
        self.root = root
        self.root.title("ファスティングダイエット支援アプリ")
        self.root.geometry("700x600")
        self.root.resizable(False, False)
        
        # データベース初期化
        self.init_database()
        
        # ファスティング状態
        self.is_fasting = True
        self.last_meal_time = self.get_last_meal_time()
        
        # 音声通知の初期化
        pygame.mixer.init()
        
        # メインフレーム
        main_frame = tk.Frame(root)
        main_frame.pack(fill="both", expand=True, padx=20, pady=20)
        
        # タイトル
        title_label = tk.Label(main_frame, text="ファスティング ダイエット サポート", font=("Arial", 18, "bold"))
        title_label.pack(pady=10)
        
        # 現在の状態フレーム
        status_frame = tk.Frame(main_frame)
        status_frame.pack(pady=20)
        
        self.status_label = tk.Label(status_frame, text="現在の状態: ファスティング中", font=("Arial", 12))
        self.status_label.pack()
        
        # 経過時間表示
        timer_frame = tk.Frame(main_frame)
        timer_frame.pack(pady=10)
        
        self.timer_label = tk.Label(timer_frame, text="00:00:00", font=("Arial", 36, "bold"))
        self.timer_label.pack()
        
        # ステータス情報
        self.status_info = tk.Label(timer_frame, text="", font=("Arial", 10))
        self.status_info.pack(pady=5)
        
        # 操作ボタンフレーム
        button_frame = tk.Frame(main_frame)
        button_frame.pack(pady=20)
        
        self.eat_button = tk.Button(button_frame, text="食事をとる", command=self.record_meal, 
                                    font=("Arial", 12), bg="#4CAF50", fg="white", width=15, height=2)
        self.eat_button.pack(side=tk.LEFT, padx=10)
        
        # 履歴フレーム
        history_frame = tk.Frame(main_frame)
        history_frame.pack(fill="both", expand=True, pady=10)
        
        history_label = tk.Label(history_frame, text="食事履歴", font=("Arial", 14, "bold"))
        history_label.pack(anchor="w")
        
        self.history_text = tk.Text(history_frame, height=10, width=70, font=("Arial", 10))
        self.history_text.pack(fill="both", expand=True)
        
        # タイマーを開始
        self.update_timer()
        
        # 食事履歴を表示
        self.update_history()
        
        # アラームスレッドを開始
        self.alarm_thread = threading.Thread(target=self.check_alarms)
        self.alarm_thread.daemon = True
        self.alarm_thread.start()
    
    def init_database(self):
        """データベースの初期化"""
        conn = sqlite3.connect('fasting_app.db')
        c = conn.cursor()
        
        # 食事記録テーブルの作成
        c.execute('''
        CREATE TABLE IF NOT EXISTS meals
        (id INTEGER PRIMARY KEY AUTOINCREMENT,
         timestamp TEXT,
         note TEXT)
        ''')
        
        conn.commit()
        conn.close()
    
    def get_last_meal_time(self):
        """最後の食事時間を取得"""
        conn = sqlite3.connect('fasting_app.db')
        c = conn.cursor()
        
        c.execute('SELECT timestamp FROM meals ORDER BY timestamp DESC LIMIT 1')
        result = c.fetchone()
        
        conn.close()
        
        if result:
            return datetime.strptime(result[0], "%Y-%m-%d %H:%M:%S")
        else:
            # デフォルト値として現在の時間から18時間前を設定
            return datetime.now() - timedelta(hours=18)
    
    def record_meal(self):
        """食事記録"""
        # 食事メモの入力ダイアログ
        note = simpledialog.askstring("食事内容", "食事内容を記録できます（任意）:")
        
        # 現在時刻を取得
        now = datetime.now()
        
        # データベースに記録
        conn = sqlite3.connect('fasting_app.db')
        c = conn.cursor()
        
        c.execute('INSERT INTO meals (timestamp, note) VALUES (?, ?)', 
                 (now.strftime("%Y-%m-%d %H:%M:%S"), note or ""))
        
        conn.commit()
        conn.close()
        
        # 最後の食事時間を更新
        self.last_meal_time = now
        
        # 状態を更新
        self.status_label.config(text="現在の状態: 食事をとりました")
        self.is_fasting = False
        
        # 履歴を更新
        self.update_history()
        
        # 通知
        messagebox.showinfo("記録完了", "食事を記録しました")
        
        # 3秒後にファスティングモードに戻る
        self.root.after(3000, self.reset_status)
    
    def reset_status(self):
        """状態をファスティングモードに戻す"""
        self.is_fasting = True
        self.status_label.config(text="現在の状態: ファスティング中")
    
    def update_timer(self):
        """タイマー表示の更新"""
        now = datetime.now()
        elapsed = now - self.last_meal_time
        
        # 経過時間（時:分:秒）
        hours, remainder = divmod(elapsed.seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        elapsed_days = elapsed.days
        total_hours = elapsed_days * 24 + hours
        
        # タイマー表示更新
        self.timer_label.config(text=f"{total_hours:02d}:{minutes:02d}:{seconds:02d}")
        
        # ステータス情報の更新
        if total_hours < 12:
            self.status_info.config(text="ファスティング中: 最低目標(12時間)まであと{}時間".format(12 - total_hours))
        elif total_hours < 18:
            self.status_info.config(text="最低目標達成!: 理想目標(18時間)まであと{}時間".format(18 - total_hours))
        else:
            self.status_info.config(text="理想目標達成!: 食事OK", fg="green")
            
        # 1秒後に再度更新
        self.root.after(1000, self.update_timer)
    
    def update_history(self):
        """食事履歴の更新"""
        conn = sqlite3.connect('fasting_app.db')
        c = conn.cursor()
        
        # 最新の7件のデータを取得
        c.execute('SELECT timestamp, note FROM meals ORDER BY timestamp DESC LIMIT 7')
        meals = c.fetchall()
        
        conn.close()
        
        # テキストをクリア
        self.history_text.delete(1.0, tk.END)
        
        if not meals:
            self.history_text.insert(tk.END, "記録がありません")
            return
        
        # 履歴を表示
        for i, (timestamp, note) in enumerate(meals):
            dt = datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S")
            formatted_date = dt.strftime("%Y年%m月%d日 %H:%M")
            
            entry = f"{i+1}. {formatted_date}"
            if note:
                entry += f" - {note}"
            
            self.history_text.insert(tk.END, entry + "\n")
    
    def check_alarms(self):
        """アラームチェック（別スレッドで実行）"""
        while True:
            if self.is_fasting:
                now = datetime.now()
                elapsed = now - self.last_meal_time
                total_hours = elapsed.days * 24 + elapsed.seconds // 3600
                
                # 12時間経過アラーム
                if total_hours == 12 and elapsed.seconds % 3600 < 60:
                    self.play_alarm("minimum")
                
                # 18時間経過アラーム
                if total_hours == 18 and elapsed.seconds % 3600 < 60:
                    self.play_alarm("ideal")
            
            # 1分ごとにチェック
            time.sleep(60)
    
    def play_alarm(self, alarm_type):
        """アラーム音を鳴らす"""
        try:
            # アラーム音（ビープ音で代用）
            pygame.mixer.music.load("beep.wav" if os.path.exists("beep.wav") else "")
            pygame.mixer.music.play()
            
            if alarm_type == "minimum":
                messagebox.showinfo("12時間達成", "最低目標の12時間ファスティングを達成しました！")
            elif alarm_type == "ideal":
                messagebox.showinfo("18時間達成", "理想的な18時間ファスティングを達成しました！食事をとっても良い時間です。")
        except:
            # 音声ファイルがない場合はメッセージボックスのみ
            if alarm_type == "minimum":
                messagebox.showinfo("12時間達成", "最低目標の12時間ファスティングを達成しました！")
            elif alarm_type == "ideal":
                messagebox.showinfo("18時間達成", "理想的な18時間ファスティングを達成しました！食事をとっても良い時間です。")

if __name__ == "__main__":
    root = tk.Tk()
    app = FastingApp(root)
    root.mainloop()
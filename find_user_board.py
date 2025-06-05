#!/usr/bin/env python3
import requests

def find_user_board():
    boards = requests.get('http://localhost:8000/api/boards/list').json()
    
    # 查找名为12121212的展板
    target_board = None
    for board in boards:
        if '12121212' in board['name'] or board['name'] == '12121212':
            target_board = board
            break
    
    if target_board:
        print(f'找到展板: {target_board["name"]} (ID: {target_board["id"]})')
        # 检查窗口
        board_data = requests.get(f'http://localhost:8000/api/boards/{target_board["id"]}').json()
        windows = board_data.get('windows', [])
        print(f'窗口数量: {len(windows)}')
        for w in windows:
            print(f'  - {w.get("title")}: {w.get("id")}')
    else:
        print('未找到名为12121212的展板')
        print('最新的几个展板:')
        for board in boards[-5:]:
            print(f'  {board["name"]} (ID: {board["id"]})')
            # 检查是否有窗口
            try:
                board_data = requests.get(f'http://localhost:8000/api/boards/{board["id"]}').json()
                windows = board_data.get('windows', [])
                if windows:
                    print(f'    🪟 有 {len(windows)} 个窗口')
                    for w in windows:
                        print(f'      - {w.get("title")}: {w.get("id")}')
            except:
                pass

if __name__ == "__main__":
    find_user_board() 
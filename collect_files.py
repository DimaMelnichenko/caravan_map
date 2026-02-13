import os
import argparse

def collect_files(source_dir, output_file, extensions=None, ignore_dirs=None):
    """
    Собирает содержимое файлов из source_dir в один output_file.
    """
    if ignore_dirs is None:
        ignore_dirs = ['.git', '__pycache__', 'venv', '.idea', '.vscode', 'node_modules', 'data', 'assets']
    
    # Преобразуем расширения в кортеж для проверки (например: ('.py', '.txt'))
    if extensions:
        extensions = tuple(ext if ext.startswith('.') else f'.{ext}' for ext in extensions)

    # Абсолютный путь к выходному файлу, чтобы исключить его из чтения
    abs_output_path = os.path.abspath(output_file)

    files_count = 0

    try:
        with open(output_file, 'w', encoding='utf-8') as outfile:
            for root, dirs, files in os.walk(source_dir):
                # Исключаем ненужные папки из обхода
                dirs[:] = [d for d in dirs if d not in ignore_dirs]

                for file in files:
                    if file in ["package.json", "migrate.js", "package-lock.json", 'world.db', 'collect_files.py', '.gitignore' ]:
                        continue
                    file_path = os.path.join(root, file)
                    abs_file_path = os.path.abspath(file_path)

                    # 1. Пропускаем сам выходной файл, если он внутри сканируемой папки
                    if abs_file_path == abs_output_path:
                        continue

                    # 2. Проверяем расширение (если заданы)
                    if extensions and not file.lower().endswith(extensions):
                        continue

                    # 3. Читаем и записываем
                    try:
                        with open(file_path, 'r', encoding='utf-8') as infile:
                            content = infile.read()
                            
                            # Пишем красивый разделитель
                            outfile.write(f"{'='*50}\n")
                            outfile.write(f"FILE: {os.path.relpath(file_path, source_dir)}\n")
                            outfile.write(f"{'='*50}\n")
                            outfile.write(content + "\n\n")
                            
                            files_count += 1
                            print(f"Добавлен: {file}")
                            
                    except UnicodeDecodeError:
                        print(f"ПРОПУЩЕН (бинарный или не UTF-8): {file}")
                    except Exception as e:
                        print(f"ОШИБКА чтения {file}: {e}")

        print(f"\nГотово! Обработано файлов: {files_count}")
        print(f"Результат сохранен в: {output_file}")

    except Exception as e:
        print(f"Критическая ошибка при создании файла: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Скрипт для объединения содержимого файлов в один.")
    
    parser.add_argument("source", help="Путь к папке с исходниками")
    parser.add_argument("-o", "--output", default="all_code.txt", help="Имя выходного файла (по умолчанию all_code.txt)")
    parser.add_argument("-e", "--extensions", nargs="+", help="Список расширений для сбора (например: py txt md js). Если не указано - берет все текстовые.")
    
    args = parser.parse_args()
    
    collect_files(args.source, args.output, args.extensions)
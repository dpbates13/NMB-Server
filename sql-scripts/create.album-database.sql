CREATE TABLE IF NOT EXISTS album_database (
    id TEXT NOT NULL PRIMARY KEY,
    album_type TEXT,
    artist TEXT,
    external_url TEXT,
    href TEXT,
    images TEXT,
    album_name TEXT,
    release_date TEXT,
    uri TEXT,
    genres TEXT
)

CREATE TABLE IF NOT EXISTS album_db (
    album_database TEXT,
    genre_list TEXT
)
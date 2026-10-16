import sqlite3, struct, base64
db=sqlite3.connect(':memory:')
db.execute('PRAGMA page_size=512')
db.execute('VACUUM')
db.executescript("""
CREATE TABLE gpkg_contents(table_name TEXT PRIMARY KEY,data_type TEXT,identifier TEXT,description TEXT,last_change TEXT,min_x DOUBLE,min_y DOUBLE,max_x DOUBLE,max_y DOUBLE,srs_id INTEGER);
CREATE TABLE gpkg_geometry_columns(table_name TEXT PRIMARY KEY,column_name TEXT,geometry_type_name TEXT,srs_id INTEGER,z INTEGER,m INTEGER);
CREATE TABLE gpkg_tile_matrix_set(table_name TEXT PRIMARY KEY,srs_id INTEGER,min_x REAL,min_y REAL,max_x REAL,max_y REAL);
CREATE TABLE gpkg_tile_matrix(table_name TEXT,zoom_level INTEGER,matrix_width INTEGER,matrix_height INTEGER,tile_width INTEGER,tile_height INTEGER,pixel_x_size REAL,pixel_y_size REAL);
CREATE TABLE "curs torrent" (fid INTEGER PRIMARY KEY AUTOINCREMENT,geom BLOB,nom TEXT,quant REAL,long_text TEXT);
CREATE TABLE imatges (id INTEGER PRIMARY KEY,zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB);
""")
db.execute("INSERT INTO gpkg_contents(table_name,data_type,identifier,srs_id) VALUES('curs torrent','features','Curs Torrent',25831)")
db.execute("INSERT INTO gpkg_contents(table_name,data_type,identifier,srs_id) VALUES('imatges','tiles','Ortoimatge',25831)")
db.execute("INSERT INTO gpkg_geometry_columns VALUES('curs torrent','geom','LINESTRING',25831,0,0)")
db.execute("INSERT INTO gpkg_tile_matrix_set VALUES('imatges',25831,400000,4599900,400256,4600156)")
db.execute("INSERT INTO gpkg_tile_matrix VALUES('imatges',1,1,1,256,256,1,1)")
header=b'GP'+bytes([0,1])+struct.pack('<i',25831)
for n in range(260):
    wkb=struct.pack('<BII4d',1,2,2,400000.0+n,4600000.0,400001.0+n,4600001.0)
    db.execute('INSERT INTO "curs torrent" (geom,nom,quant,long_text) VALUES(?,?,?,?)',(header+wkb,'torrent '+str(n),float(n),'x'*1000 if n==42 else 'short'))
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSioAAAAASUVORK5CYII=')
db.execute('INSERT INTO imatges VALUES(1,1,0,0,?)',(png,))
db.commit()
print(base64.b64encode(db.serialize()).decode())

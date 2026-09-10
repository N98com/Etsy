// Kleine, zelf gebundelde browserversie van @mapbox/vector-tile@1.3.1 +
// @mapbox/point-geometry@0.1.0 (BSD-3-Clause, https://github.com/mapbox/vector-tile-js
// en https://github.com/mapbox/point-geometry). Die npm-packages publiceren
// zelf geen kant-en-klaar browserbestand (alleen CommonJS-broncode bedoeld
// voor een bundler) — vandaar hier zelf gebundeld i.p.v. af te hangen van
// een externe CDN-URL die toch niet bestaat. Alleen wat wij nodig hebben
// (loadGeometry/type/properties/extent/layers/feature) is meegenomen;
// toGeoJSON/bbox uit het origineel zijn weggelaten, die gebruiken we niet.
// Vereist: window.Pbf (uit pbf@3, apart geladen) moet al bestaan.
(function () {
  function Point(x, y) { this.x = x; this.y = y; }
  Point.prototype.clone = function () { return new Point(this.x, this.y); };

  function VectorTileFeature(pbf, end, extent, keys, values) {
    this.properties = {};
    this.extent = extent;
    this.type = 0;
    this._pbf = pbf;
    this._geometry = -1;
    this._keys = keys;
    this._values = values;
    pbf.readFields(readFeature, this, end);
  }
  function readFeature(tag, feature, pbf) {
    if (tag === 1) feature.id = pbf.readVarint();
    else if (tag === 2) readTag(pbf, feature);
    else if (tag === 3) feature.type = pbf.readVarint();
    else if (tag === 4) feature._geometry = pbf.pos;
  }
  function readTag(pbf, feature) {
    var end = pbf.readVarint() + pbf.pos;
    while (pbf.pos < end) {
      var key = feature._keys[pbf.readVarint()];
      var value = feature._values[pbf.readVarint()];
      feature.properties[key] = value;
    }
  }
  VectorTileFeature.types = ['Unknown', 'Point', 'LineString', 'Polygon'];
  VectorTileFeature.prototype.loadGeometry = function () {
    var pbf = this._pbf;
    pbf.pos = this._geometry;
    var end = pbf.readVarint() + pbf.pos, cmd = 1, length = 0, x = 0, y = 0, lines = [], line;
    while (pbf.pos < end) {
      if (length <= 0) {
        var cmdLen = pbf.readVarint();
        cmd = cmdLen & 0x7;
        length = cmdLen >> 3;
      }
      length--;
      if (cmd === 1 || cmd === 2) {
        x += pbf.readSVarint();
        y += pbf.readSVarint();
        if (cmd === 1) { if (line) lines.push(line); line = []; }
        line.push(new Point(x, y));
      } else if (cmd === 7) {
        if (line) line.push(line[0].clone());
      } else {
        throw new Error('unknown command ' + cmd);
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  function VectorTileLayer(pbf, end) {
    this.version = 1;
    this.name = null;
    this.extent = 4096;
    this.length = 0;
    this._pbf = pbf;
    this._keys = [];
    this._values = [];
    this._features = [];
    pbf.readFields(readLayer, this, end);
    this.length = this._features.length;
  }
  function readLayer(tag, layer, pbf) {
    if (tag === 15) layer.version = pbf.readVarint();
    else if (tag === 1) layer.name = pbf.readString();
    else if (tag === 5) layer.extent = pbf.readVarint();
    else if (tag === 2) layer._features.push(pbf.pos);
    else if (tag === 3) layer._keys.push(pbf.readString());
    else if (tag === 4) layer._values.push(readValueMessage(pbf));
  }
  function readValueMessage(pbf) {
    var value = null, end = pbf.readVarint() + pbf.pos;
    while (pbf.pos < end) {
      var tag = pbf.readVarint() >> 3;
      value = tag === 1 ? pbf.readString()
        : tag === 2 ? pbf.readFloat()
        : tag === 3 ? pbf.readDouble()
        : tag === 4 ? pbf.readVarint64()
        : tag === 5 ? pbf.readVarint()
        : tag === 6 ? pbf.readSVarint()
        : tag === 7 ? pbf.readBoolean()
        : null;
    }
    return value;
  }
  VectorTileLayer.prototype.feature = function (i) {
    if (i < 0 || i >= this._features.length) throw new Error('feature index out of bounds');
    this._pbf.pos = this._features[i];
    var end = this._pbf.readVarint() + this._pbf.pos;
    return new VectorTileFeature(this._pbf, end, this.extent, this._keys, this._values);
  };

  function VectorTile(pbf, end) {
    this.layers = pbf.readFields(readTile, {}, end);
  }
  function readTile(tag, layers, pbf) {
    if (tag === 3) {
      var layer = new VectorTileLayer(pbf, pbf.readVarint() + pbf.pos);
      if (layer.length) layers[layer.name] = layer;
    }
  }

  window.VectorTile = VectorTile;
})();

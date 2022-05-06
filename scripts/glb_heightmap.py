from pygltflib import GLTF2
import struct
import sys
from PIL import Image

SIZE = int(sys.argv[2])

gltf = GLTF2().load(sys.argv[1])
mesh = gltf.meshes[gltf.scenes[gltf.scene].nodes[0]]
pixels = [[0 for x in range(SIZE)] for y in range(SIZE)]

maxy = 0
for primitive in mesh.primitives:
    accessor = gltf.accessors[primitive.attributes.POSITION]
    bufferView = gltf.bufferViews[accessor.bufferView]
    buffer = gltf.buffers[bufferView.buffer]
    data = gltf.get_data_from_buffer_uri(buffer.uri)

    for i in range(accessor.count):
        index = bufferView.byteOffset + accessor.byteOffset + i*12
        d = data[index:index+12]
        v = struct.unpack("<fff", d)
        maxy = max(maxy, v[1])

    for i in range(accessor.count):
        index = bufferView.byteOffset + accessor.byteOffset + i*12
        d = data[index:index+12]
        v = struct.unpack("<fff", d)

        px = int((v[0] + 1) / 2 * SIZE)
        py = int((v[2] + 1) / 2 * SIZE)
        pc = int(v[1] / maxy * 255)
        if v[1] > 0: pixels[px][py] = pc

f = open(sys.argv[1] + '.bhm', 'wb')
f.write(b'BHM')
f.write(SIZE.to_bytes(length=2, byteorder='big'))
f.write(struct.pack('>f', maxy))
cnt = 9
for x in range(SIZE):
    for y in range(SIZE):
        f.write(pixels[x][y].to_bytes(length=1, byteorder='big'))
        cnt += 1
f.close()
print(f"wrote {cnt} bytes")

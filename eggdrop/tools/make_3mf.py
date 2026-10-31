"""Build a Creality Print project (.3mf) for the AIR STRUT parts.

Format: the Orca/Bambu 3MF project layout that Creality Print 6+ opens as a
project (plates + per-part settings + printer/process/filament presets).
Presets are the Creality Print system presets for the K1 Max, flattened from
resources/profiles/Creality (pass the flattened JSON as argv[1]).
"""
import json, os, sys, zipfile, uuid
import numpy as np, trimesh

HERE = os.path.dirname(os.path.abspath(__file__))
STL = os.path.join(HERE, '..', 'stl')
OUT = os.path.join(HERE, '..', 'AIR_STRUT_K1Max.3mf')

PRINTER = 'Creality K1 Max 0.4 nozzle'
PROCESS = '0.20mm Standard @Creality K1 Max 0.4 nozzle'
FILAMENT = 'Hyper PLA @Creality K1 Max 0.4 nozzle'
PLATE_STRIDE = 300 * 1.2          # plate 2 sits 360 mm to the right of plate 1

COMMON = dict(enable_support='0', sparse_infill_pattern='gyroid', top_shell_layers='5', bottom_shell_layers='4')
# (file, name, plate, x, y on that plate, settings)
PARTS = [
    ('1_body.stl', 'Body', 1, 150, 150, dict(layer_height='0.24', wall_loops='5', sparse_infill_density='10%',
                                              brim_type='outer_only', brim_width='8')),
    ('2_base_cap.stl', 'Base cap', 2, 62, 112, dict(layer_height='0.2', wall_loops='4', sparse_infill_density='25%', brim_type='no_brim')),
    ('6_lid.stl', 'Lid', 2, 166, 112, dict(layer_height='0.2', wall_loops='4', sparse_infill_density='15%', brim_type='no_brim')),
    ('3_piston_head.stl', 'Piston head', 2, 255, 112, dict(layer_height='0.2', wall_loops='4', sparse_infill_density='15%', brim_type='no_brim')),
    ('4_foot_bar.stl', 'Foot bar', 2, 150, 32, dict(layer_height='0.2', wall_loops='4', sparse_infill_density='15%', brim_type='no_brim')),
    ('5_pin.stl', 'Pin', 2, 150, 205, dict(layer_height='0.2', wall_loops='3', sparse_infill_density='100%',
                                           sparse_infill_pattern='zig-zag', brim_type='no_brim')),
]
PLATE_NAMES = {1: 'Plate A - Body', 2: 'Plate B - Other parts'}
META_DROP = {'name', 'type', 'from', 'instantiation', 'inherits', 'setting_id', 'filament_id', 'compatible_printers',
             'compatible_printers_condition', 'compatible_prints', 'compatible_prints_condition', 'is_custom_defined',
             'description', 'renamed_from', 'version'}


def project_settings(flat):
    cfg = {}
    for name in (PRINTER, PROCESS, FILAMENT):
        for k, v in flat[name].items():
            if k not in META_DROP:
                cfg[k] = v
    cfg.update({
        'name': 'project_settings', 'from': 'project', 'version': '2.3.0.0',
        'printer_settings_id': PRINTER, 'print_settings_id': PROCESS, 'filament_settings_id': [FILAMENT],
        'inherits': '', 'print_compatible_printers': [PRINTER],
        'different_settings_to_system': ['', '', ''],
        'inherits_group': ['', '', ''],
    })
    return cfg


def mesh_xml(m):
    v = '\n'.join(f'     <vertex x="{a:.5f}" y="{b:.5f}" z="{c:.5f}"/>' for a, b, c in m.vertices)
    t = '\n'.join(f'     <triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in m.faces)
    return f'   <mesh>\n    <vertices>\n{v}\n    </vertices>\n    <triangles>\n{t}\n    </triangles>\n   </mesh>\n'


def main():
    flat = json.load(open(sys.argv[1]))
    objs, items, msettings = [], [], []
    plates = {1: [], 2: []}
    for i, (fn, name, plate, x, y, st) in enumerate(PARTS, start=1):
        m = trimesh.load(os.path.join(STL, fn), process=True)
        assert m.is_watertight, fn
        b = m.bounds
        m.apply_translation((-(b[0][0] + b[1][0]) / 2, -(b[0][1] + b[1][1]) / 2, -b[0][2]))
        ext = m.extents
        gx = x + (plate - 1) * PLATE_STRIDE
        lo = (x - ext[0] / 2, y - ext[1] / 2); hi = (x + ext[0] / 2, y + ext[1] / 2)
        assert lo[0] > 3 and lo[1] > 3 and hi[0] < 297 and hi[1] < 297 and ext[2] <= 300, (fn, lo, hi, ext)
        objs.append(f'  <object id="{i}" p:UUID="{uuid.uuid4()}" type="model" name="{name}">\n{mesh_xml(m)}  </object>\n')
        items.append(f'  <item objectid="{i}" p:UUID="{uuid.uuid4()}" transform="1 0 0 0 1 0 0 0 1 {gx:.3f} {y:.3f} 0" printable="1"/>\n')
        s = dict(COMMON); s.update(st)
        meta = [f'    <metadata key="name" value="{name}"/>', '    <metadata key="extruder" value="1"/>']
        meta += [f'    <metadata key="{k}" value="{v}"/>' for k, v in s.items()]
        part = (f'    <part id="{i}" subtype="normal_part">\n'
                f'      <metadata key="name" value="{fn}"/>\n'
                f'      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n'
                f'      <metadata key="source_file" value="{fn}"/>\n'
                f'      <mesh_stat edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>\n'
                f'    </part>')
        msettings.append(f'  <object id="{i}">\n' + '\n'.join(meta) + '\n' + part + '\n  </object>')
        plates[plate].append(i)
        print(f'{name:12s} plate {plate}  size {ext[0]:.1f} x {ext[1]:.1f} x {ext[2]:.1f} mm  at ({x},{y})  tris {len(m.faces)}')

    model = ('<?xml version="1.0" encoding="UTF-8"?>\n'
             '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
             'xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" '
             'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n'
             ' <metadata name="Application">OrcaSlicer-2.3.0</metadata>\n'
             ' <metadata name="BambuStudio:3mfVersion">1</metadata>\n'
             ' <metadata name="Title">AIR STRUT egg drop capsule</metadata>\n'
             ' <metadata name="Designer">AIR STRUT</metadata>\n'
             ' <resources>\n' + ''.join(objs) + ' </resources>\n'
             ' <build p:UUID="' + str(uuid.uuid4()) + '">\n' + ''.join(items) + ' </build>\n</model>\n')

    pl = []
    for p in (1, 2):
        inst = ''.join(f'    <model_instance>\n      <metadata key="object_id" value="{o}"/>\n'
                       f'      <metadata key="instance_id" value="0"/>\n      <metadata key="identify_id" value="{100 + o}"/>\n'
                       f'    </model_instance>\n' for o in plates[p])
        pl.append(f'  <plate>\n    <metadata key="plater_id" value="{p}"/>\n    <metadata key="plater_name" value="{PLATE_NAMES[p]}"/>\n'
                  f'    <metadata key="locked" value="false"/>\n{inst}  </plate>')
    mcfg = '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n' + '\n'.join(msettings) + '\n' + '\n'.join(pl) + '\n</config>\n'

    ctypes = ('<?xml version="1.0" encoding="UTF-8"?>\n'
              '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
              ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
              ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n'
              ' <Default Extension="png" ContentType="image/png"/>\n'
              ' <Default Extension="config" ContentType="text/xml"/>\n'
              '</Types>\n')
    rels = ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
            ' <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n'
            '</Relationships>\n')
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', ctypes)
        z.writestr('_rels/.rels', rels)
        z.writestr('3D/3dmodel.model', model)
        z.writestr('Metadata/model_settings.config', mcfg)
        z.writestr('Metadata/project_settings.config', json.dumps(project_settings(flat), indent=4))
    print('wrote', OUT, round(os.path.getsize(OUT) / 1e6, 1), 'MB')


if __name__ == '__main__':
    main()

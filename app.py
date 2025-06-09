import os
import tempfile
from flask import Flask, render_template, request, jsonify, send_file
from werkzeug.utils import secure_filename
import yaml


app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['ALLOWED_EXTENSIONS'] = {'inp'}

if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def convert_to_yaml(filename):
    data = {
        "title": "",
        "jobid": "",
        "melgen_input": {
            "ncg_input": [],
            "control_volumes": [],
            "control_functions": [],
            "flow_paths": [],
            "external_data_files": []
        },
        "melcor_input": {
            "warning_level": None,
            "cpu_settings": {},
            "time_settings": {}
        },
        "debug": []
    }

    current_volume = None
    current_flow_path = None  # Inicializar variable para flow path actual

    with open(filename, 'r') as file:
        for line in file:
            line = line.strip()
            if not line or line.startswith('*'):
                continue
            tokens = line.split()
            if len(tokens) == 0:
                continue
            
            try:
                # Identificar secciones
                if tokens[0].lower() == "title" and len(tokens) > 1:
                    data["title"] = " ".join(tokens[1:])
                elif tokens[0].lower() == "jobid" and len(tokens) > 1:
                    data["jobid"] = tokens[1]

                # Parte correspondiente al melgen_input
                # Procesar ncg_input
                elif tokens[0].startswith("NCG") and len(tokens) >= 3:
                    try:
                        gas_id = int(tokens[2])
                        gas_name = tokens[1]
                        data["melgen_input"]["ncg_input"].append({
                            "id": gas_id,
                            "name": gas_name
                        })
                    except ValueError:
                        data["debug"].append(f"Error parsing NCG input: {tokens}")
                        continue

                # Parser de los volúmenes de control (CV)
                elif tokens[0].startswith("CV") and len(tokens) >= 3:
                    if tokens[0].endswith("00"):  # Inicio de un nuevo control volume
                        current_volume = {
                            "id": tokens[0][2:5],
                            "name": tokens[1],
                            "type": tokens[2],
                            "properties": {},
                            "altitude_volume": {}
                        }
                        data["melgen_input"]["control_volumes"].append(current_volume)

                    elif tokens[0][-2] == "A" and tokens[0][-1].isdigit():
                        key_value_pairs = {}
                        for i in range(1, len(tokens), 2):
                            if i + 1 < len(tokens):
                                key = tokens[i]
                                try:
                                    value = float(tokens[i + 1])
                                except ValueError:
                                    value = tokens[i + 1]
                                key_value_pairs[key] = value

                        if current_volume is not None:
                            current_volume["properties"].update(key_value_pairs)

                    elif tokens[0][-2] == "B" and tokens[0][-1].isdigit():
                        key_value_pairs = {}
                        for i in range(1, len(tokens), 2):
                            if i + 1 < len(tokens):
                                key = tokens[i]
                                try:
                                    value = float(tokens[i + 1])
                                except ValueError:
                                    value = tokens[i + 1]
                                key_value_pairs[key] = value

                        if current_volume is not None:
                            current_volume["altitude_volume"].update(key_value_pairs)

                elif tokens[0].startswith("FL") and len(tokens) >= 3:
                    if tokens[0].endswith("00"):  # Inicio de un nuevo flow path
                        current_flow_path = {
                            "id": tokens[0][2:5],  # Identificador del flow path
                            "name":tokens[1],
                            "from_control_volume": {
                                "id": tokens[2],  # Volumen de control de origen
                                "height": float(tokens[4])  # Altura del volumen de control de origen
                            },
                            "to_control_volume": {
                                "id": tokens[3],  # Volumen de control de destino
                                "height": float(tokens[5])  # Altura del volumen de control de destino
                            },
                            "geometry": {},  # Inicializa el diccionario para la geometría
                            "segment_parameters": {}, 
                            "junction_limits": {},
                            "time_dependent_flow_path": {} 
                        }
                        data["melgen_input"]["flow_paths"].append(current_flow_path)

                    elif tokens[0].endswith("01") and len(tokens) >= 4:#"from_control_volume" in current_flow_path and "to_control_volume" in current_flow_path:
                        # Campo '01': Flow path geometry
                        if "geometry" in current_flow_path:
                            current_flow_path["geometry"] = {
                                "area": float(tokens[1]),  # Área del flow path
                                "length": float(tokens[2]),  # Longitud del flow path
                                "fraction_open": float(tokens[3]) if len(tokens) > 3 else None,  # Fracción del flow path abierto
                            }

                    elif tokens[0].endswith("S0") and len(tokens) >= 4:  # Campo S0
                        # Campo S0: Piping segment parameters
                        if "segment_parameters" in current_flow_path:
                            current_flow_path["segment_parameters"] = {
                                "area": float(tokens[1]),  # Área del segmento de flujo
                                "length": float(tokens[2]),  # Longitud del segmento
                                "hydraulic_diameter": float(tokens[3])  # Diámetro hidráulico del segmento
                            }

                    elif tokens[0].endswith("0F") and len(tokens) >= 3:
                        # Campo '0F': Junction limits, from volume
                        if "junction_limits" in current_flow_path:
                            current_flow_path["junction_limits"]["from_volume"] = {
                                "bottom_opening_elevation": float(tokens[1]),  # Elevación del fondo de la apertura de la junta para el volumen de origen
                                "top_opening_elevation": float(tokens[2])  # Elevación de la parte superior de la apertura de la junta para el volumen de origen
                            }

                    elif tokens[0].endswith("0T") and len(tokens) >= 3:
                        # Campo '0T': Junction limits, to volume
                        if "junction_limits" in current_flow_path:
                            current_flow_path["junction_limits"]["to_volume"] = {
                                "bottom_opening_elevation": float(tokens[1]),  # Elevación del fondo de la apertura de la junta para el volumen de destino
                                "top_opening_elevation": float(tokens[2])  # Elevación de la parte superior de la apertura de la junta para el volumen de destino
                            }

                    elif tokens[0].endswith("T0") and len(tokens) >= 3:
                        # Campo 'T0': Time dependent flow path
                            current_flow_path["time_dependent_flow_path"] = {
                                "type_flag": int(tokens[1]),  # Tipo de flujo dependiente del tiempo
                                "function_number": int(tokens[2])  # Número de función tabular o de control
                            }          

                elif tokens[0].startswith("CF") and len(tokens) >= 4:
                    if tokens[0].endswith("00"):
                        current_cf = {
                            "id": tokens[0][2:5],
                            "name": tokens[1],  # Nombre definido por el usuario de la función de control
                            "type": tokens[2],  # Tipo de función de control
                            "sinks": [],
                            "num_arguments": int(tokens[3]),  # Número de argumentos
                            "scale_factor": float(tokens[4]),  # Factor de escala multiplicativo
                            "additive_constant": float(tokens[5]) if len(tokens) > 5 else 0.0  # Constante aditiva (opcional)
                        }
                        data["melgen_input"]["control_functions"].append(current_cf)

                    elif len(tokens) >= 4 and tokens[0][2:].isdigit() and int(tokens[0][2:]) >= 10:  # Control Function Arguments (kk >= 10)
                        if current_cf is not None:
                            argument = {
                                "scale_factor": float(tokens[1]),  # Factor de escala multiplicativo
                                "additive_constant": float(tokens[2]),  # Constante aditiva
                                "database_element": tokens[3]  # Identificador del elemento de la base de datos
                            }
                            if "arguments" not in current_cf:
                                current_cf["arguments"] = []
                            current_cf["arguments"].append(argument)

                # Procesar archivos externos
                elif tokens[0].startswith("EDF") and len(tokens) >= 2:
                    if tokens[0].endswith("00"):  # External Data File Definition Record
                        current_edf = {
                            "name": tokens[1],  # User defined external data file name
                            "channels": int(tokens[2]),  # Number of channels (dependent variables)
                            "mode": tokens[3],  # Direction and mode of information transfer
                            "file_specification": {}  # Initialize file specification as empty
                        }
                        data["melgen_input"]["external_data_files"].append(current_edf)

                    elif tokens[0].endswith("01"):  # File Specification
                        # Campo '01':File Specification
                        if "file_specification" in current_edf:
                            current_edf["file_specification"] = {
                                "file_name": tokens[1]  # Name of the file in the operating system
                            }

                    elif tokens[0].endswith("02") and len(tokens) >= 2:
                        # Campo '02': External Data File Format
                        current_edf["file_format"] = tokens[1]  # Elimina comillas simples si están presentes

                    
                    elif tokens[0].endswith("10") and len(tokens) >= 3:
                        print(f"Tokens: {tokens}")
                        # Campo '10': Write Increment Control for WRITE or PUSH File
                        current_edf["write_increment_control"] = {
                            "time_effective": float(tokens[1]),  # Tiempo en el que el incremento de salida entra en efecto
                            "time_increment": float(tokens[2])  # Incremento de tiempo entre los registros de salida
                        }

                    elif tokens[0][-2] == "A" and tokens[0][-1].isdigit():
                        # Inicializa el diccionario si no existe
                        if "channel_variables" not in current_edf:
                            current_edf["channel_variables"] = {}
                        # Usa el índice como clave y el valor como el token correspondiente
                        index = tokens[0][-1]  # Obtén el índice del campo
                        value = tokens[1].strip()  # Obtén el valor del token, eliminando espacios
                        # Almacena el valor en el diccionario de variables del canal
                        current_edf["channel_variables"][f"A{index}"] = value

                elif tokens[0] == "WARNINGLEVEL":
                    data["melcor_input"]["warning_level"] = int(tokens[1])  # Guardamos el valor del WARNINGLEVEL

                # Parser para CPULEFT
                elif tokens[0] == "CPULEFT":
                    data["melcor_input"]["cpu_settings"]["cpu_left"] = float(tokens[1])  # Guardamos el valor de CPULEFT

                # Parser para CPULIM
                elif tokens[0] == "CPULIM":
                    data["melcor_input"]["cpu_settings"]["cpu_lim"] = float(tokens[1])  # Guardamos el valor de CPULIM

                # Parser para CYMESF
                elif tokens[0] == "CYMESF":
                    data["melcor_input"]["cpu_settings"]["cymesf"] = [int(x) for x in tokens[1:]]  

                # Parser para TEND
                elif tokens[0] == "TEND":
                    data["melcor_input"]["time_settings"]["tend"] = float(tokens[1])

                elif tokens[0] == "TIME1":
                    data["melcor_input"]["time_settings"]["time1"] = {
                        "time": float(tokens[1]),
                        "dtmax": float(tokens[2]),
                        "dtmin": float(tokens[3]),
                        "dtedt": float(tokens[4]),
                        "dtplt": float(tokens[5]),
                        "dtrst": float(tokens[6])
                    }
            except Exception as e:
                data["debug"].append(f"Unexpected error parsing line: {line} - Error: {str(e)}")


    yaml_filename = os.path.basename(filename).replace('.inp', '.yaml')
    yaml_path = os.path.join(app.config['UPLOAD_FOLDER'], yaml_filename)  
    
    with open(yaml_path, 'w') as yaml_file:
        yaml.dump(data, yaml_file, default_flow_style=False, sort_keys=False)

    return yaml_filename

def convert_to_melcor(yaml_filename, output_filename):
    with open(yaml_filename, 'r') as file:
        data = yaml.safe_load(file)

    lines = []

    lines.append("*EOR* MELGEN")

    base_filename = os.path.splitext(os.path.basename(yaml_filename))[0]
    lines.append(f"TITLE     {base_filename}")

    # Title y JobID del YAML 

    melgen = data.get("melgen_input", {})
    melcor = data.get("melcor_input", {})

    lines.append("************************")
    lines.append("*       NCG INPUT      *")
    lines.append("************************")

    # NCG
    for idx, ncg in enumerate(melgen.get("ncg_input", []), start=1):
        lines.append(f"NCG00{idx} {ncg['name']} {ncg['id']}")

    lines.append("************************")
    lines.append("*       CV INPUT       *")
    lines.append("************************")

    # Control Volumes
    for cv in melgen.get("control_volumes", []):
        lines.append("**********")
        vol_id = cv['id']

        lines.append(f"CV{vol_id}00 {cv['name']} {cv['type']} 0 1")

        lines.append(f"CV{vol_id}01 0 0")

        lines.append(f"CV{vol_id}A0 3")

        for idx, (key, value) in enumerate(cv.get("properties", {}).items(), start=1):
            value_str = float(value)
            lines.append(f"CV{vol_id}A{idx} {key} {value_str}")

        for idx, (key, value) in enumerate(cv.get("altitude_volume", {}).items(), start=1):
            key_str = float(key)
            value_str1 = float(value)
            lines.append(f"CV{vol_id}B{idx} {key_str} {value_str1}")

    lines.append("************************")
    lines.append("*       FL INPUT       *")
    lines.append("************************")

    # Flow Paths
    for fp in melgen.get("flow_paths", []):
        lines.append("**********")

        from_h = f"{float(fp['from_control_volume']['height']):.1f}"
        to_h = f"{float(fp['to_control_volume']['height']):.1f}"

        lines.append(
            f"FL{fp['id']}00 {fp['name']} {fp['from_control_volume']['id']} {fp['to_control_volume']['id']} "
            f"{from_h} {to_h}"
        )

        if fp.get("geometry"):
            g = fp["geometry"]
            area = f"{float(g['area']):.3f}"
            length = f"{float(g['length']):.1f}"
            fraction = f"{float(g['fraction_open']):.1f}" if 'fraction_open' in g and g['fraction_open'] != '' else ''
            lines.append(f"FL{fp['id']}01 {area} {length} {fraction}")

        lines.append(f"FL{fp['id']}02 3")

        if fp.get("segment_parameters"):
            s = fp["segment_parameters"]
            area = f"{float(s['area']):.3f}"
            length = f"{float(s['length']):.1f}"
            hd = f"{float(s['hydraulic_diameter']):.5f}"
            lines.append(f"FL{fp['id']}S0 {area} {length} {hd}")

        if fp.get("junction_limits", {}).get("from_volume"):
            j = fp["junction_limits"]["from_volume"]
            bot = f"{float(j['bottom_opening_elevation']):.1f}"
            top = f"{float(j['top_opening_elevation']):.1f}"
            lines.append(f"FL{fp['id']}0F {bot} {top}")

        if fp.get("junction_limits", {}).get("to_volume"):
            j = fp["junction_limits"]["to_volume"]
            bot = f"{float(j['bottom_opening_elevation']):.1f}"
            top = f"{float(j['top_opening_elevation']):.1f}"
            lines.append(f"FL{fp['id']}0T {bot} {top}")

        if fp.get("time_dependent_flow_path"):
            t = fp["time_dependent_flow_path"]
            function_number = str(t["function_number"]).zfill(3) 
            lines.append(f"FL{fp['id']}T0 {t['type_flag']} {function_number}")

    lines.append("************************")
    lines.append("*       CF INPUT       *")
    lines.append("************************")

    # Control Functions
    for cf in melgen.get("control_functions", []):
        lines.append("**********")

        scale = f"{float(cf['scale_factor']):.1f}"
        additive = f"{float(cf.get('additive_constant', 0.0)):.1f}"
        lines.append(
            f"CF{cf['id']}00 {cf['name']} {cf['type']} {cf['num_arguments']} {scale} {additive}"
        )

        for i, arg in enumerate(cf.get("arguments", [])):
            sf = f"{float(arg['scale_factor']):.1f}"
            ac = f"{float(arg['additive_constant']):.1f}"
            lines.append(f"CF{cf['id']}{10 + i} {sf} {ac} {arg['database_element']}")


    lines.append("************************")
    lines.append("*       EDF INPUT      *")
    lines.append("************************")
    
    # External Data Files
    for idx, edf in enumerate(melgen.get("external_data_files", [])):
        lines.append("**********")
        
        name = edf.get("name", "")
        channels = edf.get("channels", "")
        mode = edf.get("mode", "")
        lines.append(f"{'EDF00100':<10}{name:<12}{channels:<6}{mode:<10}")
        
        if "file_specification" in edf:
            file_name = edf["file_specification"].get("file_name", "")
            lines.append(f"{'EDF00101':<10}{file_name}")
        
        if "file_format" in edf:
            file_format = edf["file_format"]
            lines.append(f"{'EDF00102':<10}{file_format}")
        
        if "write_increment_control" in edf:
            w = edf["write_increment_control"]
            time_effective = f"{float(w.get('time_effective', 0.0)):.1f}"
            time_increment = f"{float(w.get('time_increment', 0.0)):.1f}"
            lines.append(f"{'EDF00110':<10}{time_effective:<12}{time_increment}")
        
        channel_vars = edf.get("channel_variables", {})
        for i, (k, v) in enumerate(channel_vars.items(), start=1):
            lines.append(f"{'EDF001A'+str(i):<10}{v}")


    lines.append(". * END MELGEN")

    lines.append("************************")
    lines.append("*      MELCOR INPUT    *")
    lines.append("************************")

    lines.append("*EOR* MELCOR")
    
    # WARNINGLEVEL
    if melcor.get("warning_level") is not None:
        lines.append(f"WARNINGLEVEL {melcor['warning_level']}")

        melcor = data.get("melcor_input", {})

    lines.append(f"TITLE     {base_filename}")

    # CPULEFT
    cpu_settings = melcor.get("cpu_settings", {})
    if "cpu_left" in cpu_settings:
        cpu_left = float(cpu_settings["cpu_left"])
        lines.append(f"{'CPULEFT':<10}{cpu_left:.1f}")

    # CPULIM
    if "cpu_lim" in cpu_settings:
        cpu_lim = float(cpu_settings["cpu_lim"])
        lines.append(f"{'CPULIM':<10}{cpu_lim:.1f}")

    # CYMESF
    cymesf = cpu_settings.get("cymesf", [])
    if cymesf:
        cymesf_values = " ".join(str(int(float(v))) for v in cymesf)
        lines.append(f"{'CYMESF':<10}{cymesf_values}")

    # TEND
    time_settings = melcor.get("time_settings", {})
    if "tend" in time_settings:
        tend = float(time_settings["tend"])
        lines.append(f"{'TEND':<10}{tend:.1f}")

    # TIME1
    time1 = time_settings.get("time1", {})
    if time1:
        time1_values = [
            float(time1.get("time", 0)),
            float(time1.get("dtmax", 0)),
            float(time1.get("dtmin", 0)),
            float(time1.get("dtedt", 0)),
            float(time1.get("dtplt", 0)),
            float(time1.get("dtrst", 0)),
        ]
        time1_line = " ".join(f"{v:.1f}" for v in time1_values)
        lines.append(f"{'TIME1':<10}{time1_line}")

    # Agregar final MELCOR
    lines.append(". * END MELCOR")
    
    os.makedirs(os.path.dirname(output_filename), exist_ok=True)
    with open(output_filename, 'w') as out:
        out.write('\n'.join(lines) + '\n')

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/upload", methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)

        yaml_filename = convert_to_yaml(file_path)
        yaml_path = os.path.join(app.config['UPLOAD_FOLDER'], yaml_filename)

        with open(yaml_path, 'r') as f:
            yaml_content = f.read()

        return jsonify({'yaml': yaml_content})

    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/convert-to-melcor', methods=['POST'])
def convert_to_melcor_route():
    data = request.get_json()

    yaml_content = data.get('yamlContent')
    file_name = data.get('fileName')

    if not yaml_content or not file_name:
        return "Missing data", 400

    temp_dir = tempfile.mkdtemp()
    yaml_path = os.path.join(temp_dir, file_name + '.yaml')
    melcor_path = os.path.join(temp_dir, file_name + '.melcor')

    with open(yaml_path, 'w') as yaml_file:
        yaml_file.write(yaml_content)

    convert_to_melcor(yaml_path, melcor_path)

    return send_file(melcor_path, as_attachment=True, download_name=file_name + '.inp')

if __name__ == "__main__":
    app.run(debug=True)


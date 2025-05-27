// Variables globales para todo el codigo
const otrosDatosButton = document.getElementById("otrosDatosBtn");
const modal = document.getElementById("otrosDatosModal");
const closeModalButton = document.getElementById("closeModalBtn");
const modalContent = document.querySelector("#otrosDatosModal .modal-content");
const downloadButton = document.getElementById('downloadBtn');
const newDiagramBtn = document.getElementById('newDiagramBtn');
const deleteButton = document.getElementById("deleteButton");
const propertiesContent = document.getElementById('propertiesContent');

let nodeIdCounter = 1;
let modalOpen = false;
let selectingFlowPath = false;
let selectedNodes = [];

let network;
let nodes = new vis.DataSet();
let edges = new vis.DataSet();
const container = document.getElementById("network");
let data = {};
const options = {};

const initialYaml = {
    title: "Nuevo Diagrama",
    jobid: "",
    melgen_input: {
        ncg_input: [],
        control_volumes: [],
        control_functions: [],
        flow_paths: [],
        external_data_files: [
            {
                name: "PRESSURES",
                channels: 1,
                mode: "WRITE",
                file_specification: {
                    file_name: "PRESSURES.DAT"
                },
                file_format: "8E20.12",
                write_increment_control: {
                    time_effective: 0.0,
                    time_increment: 0.0
                },
                channel_variables: {
                    A1: "CVH-P.1"
                }
            }
        ]
    },
    melcor_input: {
        warning_level: 2,
        cpu_settings: {
            cpu_left: 100.0,
            cpu_lim: 100000.0,
            cymesf: [100, 100]
        },
        time_settings: {
            tend: 5000.0,
            time1: {
                time: 0.0,
                dtmax: 1.0,
                dtmin: 1.0,
                dtedt: 1.0,
                dtplt: 1.0,
                dtrst: 1.0
            }
        }
    },
    debug: []
};

const draggables = document.querySelectorAll('.draggable');
let yamlData = null;

// Función para generar un ID único con prefijo
const generatePrefixedId = (prefix, id) => {
    return `${prefix}_${id}`;
};

// Función para limpiar completamente el grafo
function clearGraph() {
    nodes.clear();
    edges.clear();
    if (network) {
        network.destroy(); // Destruir instancia de Vis.js para evitar residuos
    }
}

// Nueva función que procesa directamente el string YAML
function handleFileUpload(yamlString) {
    try {
        console.log("Contenido del YAML leído:", yamlString);
        yamlData = jsyaml.load(yamlString);
        console.log("YAML parseado:", yamlData);
        clearGraph();

        // Añadimos nodos de Control Volumes (CV)
        yamlData.melgen_input.control_volumes.forEach(cv => {
            const prefixedId = generatePrefixedId("cv", cv.id);
            nodes.add({
                id: prefixedId,
                label: cv.name,
                shape: "box",
                color: "#D9E2F3",
                properties: cv.properties,
                altitude_volume: cv.altitude_volume,
                type: 'control_volume'
            });
        });

        // Añadimos nodos de Control Functions (CF)
        yamlData.melgen_input.control_functions.forEach(cf => {
            const prefixedId = generatePrefixedId("cf", cf.id);
            nodes.add({
                id: prefixedId,
                label: cf.name,
                shape: "circle",
                color: "#F5A5D5",
                properties: {
                    type: cf.type,
                    sinks: cf.sinks,
                    num_arguments: cf.num_arguments,
                    scale_factor: cf.scale_factor,
                    additive_constant: cf.additive_constant,
                    arguments: cf.arguments
                },
                type: 'control_function'
            });
        });

        // Añadimos aristas de Flow Paths (FP)
        yamlData.melgen_input.flow_paths.forEach(fp => {
            const fromControlVolumeId = generatePrefixedId("cv", fp.from_control_volume.id);
            const toControlVolumeId = generatePrefixedId("cv", fp.to_control_volume.id);
            const prefixedId = generatePrefixedId("fp", fp.id);

            edges.add({
                id: prefixedId,
                from: fromControlVolumeId,
                to: toControlVolumeId,
                label: fp.name,
                properties: fp.geometry,
                segment_parameters: fp.segment_parameters,
                junction_limits: fp.junction_limits,
                time_dependent_flow_path: fp.time_dependent_flow_path,
                type: 'flow_path'
            });
        });

        initializeGraph();
    } catch (e) {
        alert('Error al leer el YAML recibido: ' + e.message);
    }
}

function setupNetworkListeners() {
    if (!network) {
        console.error("Error: network aún no ha sido inicializado.");
        return;
    }
    network.on("click", function (event) {
        if(!selectingFlowPath){

            console.log("Se ha hecho click");
            const { nodes: clickedNodes, edges: clickedEdges } = event;
        
            if (clickedNodes.length > 0) {
                const nodeId = clickedNodes[0];
                const node = network.body.data.nodes.get(nodeId);
        
                // Distinción entre nodos de Control Volumes y Control Functions
                if (nodeId.startsWith("cv")) {

                    const controlVolumeId = nodeId.replace("cv_", "");
                    const controlVolume = yamlData.melgen_input.control_volumes.find(cv => cv.id === controlVolumeId);

                    const editForm = createEditFormControlVolume(
                        controlVolume.id,
                        controlVolume.name,
                        controlVolume.properties,
                        controlVolume.altitude_volume,
                        (newProps, newAltitudeVolume) => {
                            // Actualizar el nodo con los nuevos valores
                            network.body.data.nodes.update({ 
                                id: nodeId, 
                                properties: newProps, 
                                altitude_volume: newAltitudeVolume 
                            });
                        });
    
                    propertiesContent.innerHTML = editForm;
        
                    document.getElementById("saveProperties").addEventListener("click", () => {
                        const newProps = {};
                        const newAltitudeVolume = {};
                        let mlfrTotal = 0;
                        let mlfrValid = true;
                        let invalidFields = false;
        
                        // Validación de los campos MLFR
                        Object.keys(controlVolume.properties).forEach(key => {
                            const input = document.getElementById(`edit-${key}`);
                            if (input) {
                                const value = input.value.trim();
                                
                                // Verificación de que el valor no tiene letras o caracteres no válidos
                                if (isNaN(value) || value === '') {
                                    alert('El valor debe ser un número válido.');
                                    invalidFields = true;
                                    return; // Cancelar el cambio si no es un número
                                }
        
                                // Comprobamos si el valor es negativo
                                const numericValue = parseFloat(value);
                                if (numericValue < 0) {
                                    alert('El valor no puede ser negativo.');
                                    invalidFields = true;
                                    return; // Cancelar el cambio si el valor es negativo
                                }
        
                                if (key.startsWith("MLFR")) {
                                    // Comprobamos si el valor es numérico y está dentro del rango adecuado
                                    if (isNaN(numericValue) || numericValue < 0.0 || numericValue > 1.0) {
                                        mlfrValid = false;
                                        alert('Los valores de MLFR deben ser numéricos y estar entre 0.0 y 1.0.');
                                    } else {
                                        mlfrTotal += numericValue;
                                    }
                                    
                                }

                                // Comprobación específica para RHUM
                                if (key === "RHUM" && (numericValue < 0.0 || numericValue > 1.0)) {
                                    alert('El valor de RHUM debe estar entre 0.0 y 1.0.');
                                    invalidFields = true;
                                    return;
                                }
        
                                newProps[key] = value; // Actualizar el valor de la propiedad
                            }
                        });
        
                        // Validación de altitude_volume
                        Object.keys(controlVolume.altitude_volume).forEach(key => {
                            const keyInput = document.getElementById(`altitude-key-${key}`);
                            const valueInput = document.getElementById(`altitude-value-${key}`);
                            const keyValue = keyInput ? keyInput.value : '';
                            const valueValue = valueInput ? valueInput.value : '';
        
                            if (isNaN(keyValue) || isNaN(valueValue) || keyValue === '' || valueValue === '') {
                                console.error('Error en validación. Contenido de altitude_volume:', controlVolume.altitudeVolume);
                                alert('Las claves y los valores deben ser números válidos.');
                                invalidFields = true;
                                return;
                            }
        
                            if (parseFloat(keyValue) < 0 || parseFloat(valueValue) < 0) {
                                alert('Las claves y los valores no pueden ser negativos.');
                                invalidFields = true;
                                return;
                            }
        
                            newAltitudeVolume[keyValue] = parseFloat(valueValue);
                        });
                        
                        // Verificación de que la suma de los valores MLFR es exactamente 1.0
                        if (mlfrValid && mlfrTotal !== 1.0) {
                            alert('La suma de todos los valores de MLFR debe ser exactamente 1.0.');
                            return; // Detener la ejecución si la condición no se cumple
                        }
                        
                        if (mlfrValid && mlfrTotal === 1.0 && !invalidFields) {
                            const parsedProps = {};
                            for (const [key, value] of Object.entries(newProps)) {
                                parsedProps[key] = parseFloat(value); // Convertimos cada propiedad a double
                            }

                            const parsedAltitudeVolume = {};
                            for (const [key, value] of Object.entries(newAltitudeVolume)) {
                                const altitude = parseFloat(key); // Convertimos la altitud a double
                                const volume = parseFloat(value); // Convertimos el volumen a double
                                parsedAltitudeVolume[altitude] = volume;
                            }

                            const existingNode = network.body.data.nodes.get(nodeId);

                            // Actualizar solo properties y altitude_volume sin perder otros datos
                            network.body.data.nodes.update({ 
                                id: nodeId, 
                                properties: { ...existingNode.properties, ...parsedProps }, 
                                altitude_volume: { ...existingNode.altitude_volume, ...parsedAltitudeVolume }
                            });
                            
                            const controlVolumeId = nodeId.replace(/^\D+/g, ""); // Extraer el ID (sin prefijo 'cv')
                            const controlVolume = yamlData.melgen_input.control_volumes.find(cv => cv.id === controlVolumeId);
        
                            if (controlVolume) {
                                // Actualizar únicamente properties y altitude_volume
                                controlVolume.properties = { ...controlVolume.properties, ...parsedProps };
                                controlVolume.altitude_volume = { ...parsedAltitudeVolume };
                            

                                console.log("Control Volume actualizado:", controlVolume);
                                console.log("yamlData actualizado:", JSON.stringify(yamlData, null, 2));
                            }
        
                            propertiesContent.innerHTML = "Cambios guardados.";
                        }
                    });
        
                    document.getElementById("cancelEdit").addEventListener("click", () => {
                        propertiesContent.innerHTML = '';
                    });
        
                } else if (nodeId.startsWith("cf")) {  
                    const propertiesContent = document.getElementById('propertiesContent');
                    propertiesContent.innerHTML = createEditFormControlFunction(nodeId, node.label, node.properties, (newProps) => {
                        network.body.data.nodes.update({ id: nodeId, properties: newProps });
                    });
        
                    // Mapa con el número de argumentos requeridos por tipo
                    const argumentCountByType = {
                        "L-EQUALS": 2, "L-NOT": 1, "L-EQV": 2, "L-EQ": 2, "L-GT": 2, "L-GE": 2, "L-NE": 2,
                        "L-AND": 2, "L-OR": 2, "L-L-IFTE": 3, "EQUALS": 2, "ABS": 1, "ADD": 2, "DIM": 3,
                        "MULTIPLY": 2, "DIVIDE": 2, "POWER-I": 2, "POWER-R": 2, "POWER-V": 2, "EXP": 1,
                        "LN": 1, "LOG": 1, "SQRT": 1, "COS": 1, "SIN": 1, "TAN": 1, "ARCCOS": 1,
                        "ARCSIN": 1, "ARCTAN": 1, "COSH": 1, "SINH": 1, "TANH": 1, "MAX": 2, "MIN": 2,
                        "SIGN": 1, "SIGNI": 1, "UNIT-NRM": 1, "TAB-FUN": 1, "L-A-IFTE": 3   
                    };

                    // Generar argumentos dinámicamente
                    const generateArgumentsForm = (numArguments, argumentsList) => {
                        let argumentsForm = '<h5>Editar Argumentos:</h5>';
                        for (let i = 0; i < numArguments; i++) {
                            const arg = argumentsList[i] || { scale_factor: '', additive_constant: '', database_element: '' };
                            argumentsForm += `
                                <div class="argument-section">
                                    <label>Argumento ${i + 1}:</label><br>
                                    <label>Factor de escala: </label>
                                    <input type="text" id="edit-arg-${i}-scale-factor" value="${arg.scale_factor}" /><br>
                                    <label>Constante aditiva: </label>
                                    <input type="text" id="edit-arg-${i}-additive-constant" value="${arg.additive_constant}" /><br>
                                    <label>Elemento de base de datos: </label>
                                    <input type="text" id="edit-arg-${i}-database-element" value="${arg.database_element}" /><br><br>
                                </div>
                            `;
                        }
                        document.getElementById('arguments-container').innerHTML = argumentsForm;
                    };
        
                    // Inicializar argumentos
                    generateArgumentsForm(node.properties.num_arguments, node.properties.arguments);
        
                    // Validar el número de argumentos al cambiar
                    document.getElementById('edit-num-arguments').addEventListener('input', (event) => {
                        const value = event.target.value.trim();
                        const newNumArguments = parseInt(value, 10);
        
                        if (isNaN(newNumArguments) || newNumArguments < 0 || value !== String(newNumArguments)) {
                            alert("El número de argumentos debe ser un número entero positivo.");
                            event.target.value = node.properties.num_arguments || 0; // Restaurar valor previo
                            return;
                        }
        
                        generateArgumentsForm(newNumArguments, node.properties.arguments);
                    });

                    // Cambiar tipo de función → actualizar número de argumentos automáticamente
                    document.getElementById('edit-type').addEventListener('change', (event) => {
                        const selectedType = event.target.value;
                        const requiredArgs = argumentCountByType[selectedType] || 0;

                        // Actualizar input de número de argumentos
                        const numArgInput = document.getElementById('edit-num-arguments');
                        numArgInput.value = requiredArgs;

                        // Regenerar formulario de argumentos, manteniendo los existentes
                        generateArgumentsForm(requiredArgs, node.properties.arguments);
                    });
        
                    // Manejo del evento de guardar
                    document.getElementById("saveProperties").addEventListener("click", () => {
                        let invalidFields = false;
                        const newProps = {
                            type: document.getElementById("edit-type").value.trim(),
                            num_arguments: parseInt(document.getElementById("edit-num-arguments").value.trim(), 10),
                            scale_factor: document.getElementById("edit-scale-factor").value.trim(),
                            additive_constant: document.getElementById("edit-additive-constant").value.trim(),
                            arguments: []
                        };
                    
                        // Validar el número de argumentos: debe ser un entero positivo
                        if (isNaN(newProps.num_arguments) || newProps.num_arguments < 0 || !Number.isInteger(newProps.num_arguments)) {
                            alert("El número de argumentos debe ser un número entero positivo.");
                            invalidFields = true;
                        }
                    
                        // Validar el factor de escala: debe ser un número y no contener letras
                        if (!/^-?\d+(\.\d+)?$/.test(newProps.scale_factor)) {
                            alert("El Factor de Escala debe ser un número válido (sin letras ni caracteres especiales).");
                            invalidFields = true;
                        } else {
                            newProps.scale_factor = parseFloat(newProps.scale_factor);
                        }
                    
                        // Validar la constante aditiva: debe ser un número y no contener letras
                        if (!/^-?\d+(\.\d+)?$/.test(newProps.additive_constant)) {
                            alert("La Constante Aditiva debe ser un número válido (sin letras ni caracteres especiales).");
                            invalidFields = true;
                        } else {
                            newProps.additive_constant = parseFloat(newProps.additive_constant);
                        }
                    
                        // Validar y recopilar argumentos
                        for (let i = 0; i < newProps.num_arguments; i++) {
                            const scaleFactor = document.getElementById(`edit-arg-${i}-scale-factor`).value.trim();
                            const additiveConstant = document.getElementById(`edit-arg-${i}-additive-constant`).value.trim();
                            const databaseElement = document.getElementById(`edit-arg-${i}-database-element`).value.trim();
                    
                            // Validar Factor de Escala: debe ser un número
                            if (!/^-?\d+(\.\d+)?$/.test(scaleFactor)) {
                                alert(`El campo "Factor de Escala" del argumento ${i + 1} contiene valores inválidos. Solo se permiten números.`);
                                invalidFields = true;
                                break;
                            }
                    
                            // Validar Constante Aditiva: debe ser un número
                            if (!/^-?\d+(\.\d+)?$/.test(additiveConstant)) {
                                alert(`El campo "Constante Aditiva" del argumento ${i + 1} contiene valores inválidos. Solo se permiten números.`);
                                invalidFields = true;
                                break;
                            }
                    
                            // Validar Elemento de Base de Datos: debe comenzar por una letra y solo puede contener letras, números, guiones y puntos
                            if (!/^[a-zA-Z][a-zA-Z0-9\-.]*$/.test(databaseElement)) {
                                alert(`El campo "Elemento de Base de Datos" del argumento ${i + 1} debe comenzar por una letra y solo puede contener letras, números, guiones y puntos.`);
                                invalidFields = true;
                                break;
                            }
                    
                            newProps.arguments.push({
                                scale_factor: parseFloat(scaleFactor),
                                additive_constant: parseFloat(additiveConstant),
                                database_element: databaseElement
                            });
                        }
                    
                        if (!invalidFields) {
                            network.body.data.nodes.update({ id: nodeId, properties: newProps });
        
                            // Actualizar la variable yamlData
                            const controlFunctionId = nodeId.replace(/^\D+/g, ""); // Extraer ID sin prefijo
                            const controlFunction = yamlData.melgen_input.control_functions.find(cf => cf.id === controlFunctionId);
        
                            if (controlFunction) {
                                controlFunction.type = newProps.type;
                                controlFunction.num_arguments = newProps.num_arguments;
                                controlFunction.scale_factor = newProps.scale_factor;
                                controlFunction.additive_constant = newProps.additive_constant;
                                controlFunction.arguments = newProps.arguments;
                                console.log("yamlData actualizado:", JSON.stringify(yamlData, null, 2));
                            } else {
                                console.error(`No se encontró una función de control con el ID ${controlFunctionId}`);
                            }
        
                            propertiesContent.innerHTML = "Cambios guardados.";
                        }
                    });                        
        
                    // Manejo del evento de cancelar
                    document.getElementById("cancelEdit").addEventListener("click", () => {
                        propertiesContent.innerHTML = '';
                    });
        
                }
            } else if (clickedEdges.length > 0) {
                const edgeId = clickedEdges[0];
                const edge = network.body.data.edges.get(edgeId);
        
                // Generar el formulario de edición
                const editForm = createEditFormFlowPath(
                    edgeId,
                    edge.label || "",
                    edge.properties || {},
                    edge.segment_parameters || {},
                    edge.junction_limits || {},
                    edge.time_dependent_flow_path || {}
                );
        
                const propertiesContent = document.getElementById('propertiesContent');
                propertiesContent.innerHTML = editForm;
        
                // Guardar cambios
                document.getElementById("saveFlowPathProperties").addEventListener("click", () => {
                    let invalidFields = false;
        
                    // Validar y actualizar propiedades
                    const newProps = {};
                    Object.keys(edge.properties || {}).forEach(key => {
                        const input = document.getElementById(`edit-geometry-${key}`);
                        if (input) {
                            const value = input.value.trim();
                            const numericValue = parseFloat(value);

                            if (isNaN(numericValue) || value === '') {
                                alert(`El valor de ${key} debe ser un número válido.`);
                                invalidFields = true;
                            } else {
                                if (key === "fraction_open") {
                                    if (numericValue < 0.0 || numericValue > 1.0) {
                                        alert(`El valor de ${key} debe estar entre 0.0 y 1.0.`);
                                        invalidFields = true;
                                    } else {
                                        newProps[key] = numericValue;
                                    }
                                } else {
                                    // Validación estándar para otros campos: deben ser > 0
                                    if (numericValue <= 0 || value !== String(numericValue)) {
                                        alert(`El valor de ${key} debe ser un número positivo válido.`);
                                        invalidFields = true;
                                    } else {
                                        newProps[key] = numericValue;
                                    }
                                }
                            }
                        }
                    });

                    // Validar y actualizar parámetros del segmento
                    const newSegmentParams = {};
                    Object.keys(edge.segment_parameters || {}).forEach(key => {
                        const input = document.getElementById(`edit-segment-${key}`);
                        if (input) {
                            const value = input.value.trim();
                            const numericValue = parseFloat(value);
        
                            // Verificación: Comprobar que el valor completo sea numérico y mayor que 0
                            if (isNaN(numericValue) || value === '' || numericValue <= 0 || value !== String(numericValue)) {
                                alert(`El valor de ${key} debe ser un número positivo válido.`);
                                invalidFields = true;
                            } else {
                                newSegmentParams[key] = numericValue;
                            }
                        }
                    });
        
                    // Validar y actualizar límites de la unión
                    const newJunctionLimits = {};
                    Object.keys(edge.junction_limits || {}).forEach(key => {
                        newJunctionLimits[key] = {};
                        Object.keys(edge.junction_limits[key] || {}).forEach(subKey => {
                            const input = document.getElementById(`edit-junction-${key}-${subKey}`);
                            if (input) {
                                const value = input.value.trim();
                                const numericValue = parseFloat(value);
        
                                // Verificación: Comprobar que el valor completo sea numérico y mayor que 0
                                if (isNaN(numericValue) || value === '' || numericValue <= 0 || value !== String(numericValue)) {
                                    alert(`El valor de ${key} - ${subKey} debe ser un número positivo válido.`);
                                    invalidFields = true;
                                } else {
                                    newJunctionLimits[key][subKey] = numericValue;
                                }
                            }
                        });
                    });
        
                    // Validar y actualizar flujo dependiente del tiempo
                    const newTimeDependentFlowPath = {};
                    Object.keys(edge.time_dependent_flow_path || {}).forEach(key => {
                        const input = document.getElementById(`edit-time-dependent-${key}`);
                        if (input) {
                            const value = input.value.trim();
                            const numericValue = parseFloat(value);
        
                            // Verificación: Comprobar que el valor completo sea numérico y mayor que 0
                            if (isNaN(numericValue) || value === '' || numericValue <= 0 || value !== String(numericValue)) {
                                alert(`El valor de ${key} debe ser un número positivo válido.`);
                                invalidFields = true;
                            } else {
                                newTimeDependentFlowPath[key] = numericValue;
                            }
                        }
                    });
        
                    if (!invalidFields) {
                        // Actualizar la información del edge
                        network.body.data.edges.update({
                            id: edgeId,
                            properties: newProps,
                            segment_parameters: newSegmentParams,
                            junction_limits: newJunctionLimits,
                            time_dependent_flow_path: newTimeDependentFlowPath
                        });
        
                        // Actualizar yamlData
                        const flowPathId = edgeId.replace(/^\D+/g, "");
                        const flowPath = yamlData.melgen_input.flow_paths.find(fp => fp.id === flowPathId);
        
                        if (flowPath) {
                            flowPath.geometry = { ...newProps };
                            flowPath.segment_parameters = { ...newSegmentParams };
                            flowPath.junction_limits = { ...newJunctionLimits };
                            flowPath.time_dependent_flow_path = { ...newTimeDependentFlowPath };
        
                            console.log("Flow Path actualizado:", flowPath);
                            console.log("yamlData actualizado:", JSON.stringify(yamlData, null, 2));
                        } else {
                            console.error(`No se encontró el Flow Path con ID: ${flowPathId}`);
                        }
        
        
                        propertiesContent.innerHTML = "Cambios guardados.";
                    }
                });
        
                // Cancelar edición
                document.getElementById("cancelEditFlowPath").addEventListener("click", () => {
                    propertiesContent.innerHTML = '';
                });
            } else {
                document.getElementById('propertiesContent').innerHTML = '';
            }
        }
        else{
            // Accedemos a los nodos del evento
            const nodeId = event.nodes[0];

            if (!nodeId){
                selectingFlowPath = false
                return; // No se hizo click en un nodo
            }

            const node = nodes.get(nodeId);
            if (!nodeId.startsWith("cv")) {
                alert("Debes seleccionar únicamente Control Volumes.");
                selectingFlowPath = false;
                return;
            }
            else{
                selectedNodes.push(nodeId);
            }            

            if (selectedNodes.length === 2) {
                selectingFlowPath = false; // Se completó la selección
                openModalToAddEdge(selectedNodes[0], selectedNodes[1]);
            }
        }
    });
}

downloadButton.addEventListener('click', async () => {
    try {
        let fileName = prompt("Introduce el nombre del archivo (sin extensión):", "datos_actualizados");
        
        if (!fileName || fileName.trim() === "") {
            fileName = "datos_actualizados";
        }
        
        fileName = fileName.trim(); 

        // Convertir yamlData a texto YAML
        const yamlContent = jsyaml.dump(yamlData);

        // Enviar al servidor para convertir a MELCOR
        const response = await fetch('/convert-to-melcor', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fileName: fileName, // sin extensión
                yamlContent: yamlContent
            })
        });

        if (!response.ok) {
            throw new Error('Error en la conversión a MELCOR');
        }

        // Recibir el archivo MELCOR como Blob
        const melcorBlob = await response.blob();

        // Crear enlace de descarga
        const link = document.createElement('a');
        link.href = URL.createObjectURL(melcorBlob);
        link.download = fileName + '.inp';
        link.click();

        URL.revokeObjectURL(link.href);

    } catch (error) {
        console.error("Error al generar o descargar el archivo MELCOR:", error);
    }
});

const openModal = () => {
    modal.classList.remove("hidden");
    modal.style.display = "flex";

    const ncgInputForm = createEditFormNCGInput(yamlData.melgen_input.ncg_input || []);
    const externalDataFilesForm = createEditFormExternalDataFiles(yamlData.melgen_input.external_data_files || []);

    modalContent.innerHTML = `
        <span class="close-btn" id="closeModalBtn">&times;</span>
        <h2>Editar Otros Datos</h2>
        <div>
            <h3>NCG Input</h3>
            ${ncgInputForm}
        </div>
        <div>
            <h3>External Data Files</h3>
            ${externalDataFilesForm}
        </div>
    `;

    const closeModalButton = document.getElementById("closeModalBtn");
    closeModalButton.addEventListener("click", () => {
        modal.classList.add("hidden");
        modal.style.display = "none";
    });

    // Guardar cambios en NCG Input
    const saveNCGButton = document.getElementById("saveNCGInput");
    saveNCGButton.addEventListener("click", () => {
        const updatedNCGInputs = [];
        const startingId = 4;
        document.querySelectorAll(".ncg-section").forEach((section, newIndex) => {
            const name = section.querySelector(`#ncg-name-${newIndex}`).value;
            updatedNCGInputs.push({ id: startingId + newIndex, name });
        });        
    
        // Actualizar los datos del YAML
        yamlData.melgen_input.ncg_input = updatedNCGInputs;
        console.log("Datos NCG guardados:", yamlData.melgen_input.ncg_input);
    
        // Cerrar el modal
        modal.classList.add("hidden");
        modal.style.display = "none";
    });

    // Botones para eliminar gases
    document.querySelectorAll(".delete-ncg-btn").forEach((button, index) => {
        button.addEventListener("click", () => {
            const gasToRemove = yamlData.melgen_input.ncg_input[index];
            const gasIdToRemove = gasToRemove.id;

            // Eliminar el gas del array
            yamlData.melgen_input.ncg_input.splice(index, 1);
            console.log(`Gas con ID ${gasIdToRemove} eliminado.`);

            // Reasignar IDs consecutivos tras eliminar
            const startingId = 4;
            yamlData.melgen_input.ncg_input = yamlData.melgen_input.ncg_input.map((gas, i) => ({
                id: startingId + i,
                name: gas.name
            }));

            // Actualizar volúmenes de control
            syncMLFRProperties();

            console.log("Volúmenes de control actualizados tras eliminar gas:", yamlData.melgen_input.control_volumes);

            // Recargar el modal para reflejar los cambios
            openModal();
        });
    });

    // Botón para añadir un gas
    const addButton = document.getElementById("add-ncg-btn");
    if (addButton) {
        addButton.addEventListener("click", () => {
            const selectedGasName = document.getElementById("add-ncg-select").value;

            // Añadir el nuevo gas al array
            yamlData.melgen_input.ncg_input.push({ id: 0, name: selectedGasName }); // ID temporal

            // Reasignar todos los IDs para mantener secuencia
            const startingId = 4;
            yamlData.melgen_input.ncg_input.forEach((gas, index) => {
                gas.id = startingId + index;
            });

            console.log(`Gas añadido: { name: ${selectedGasName} }`);

            // Sincronizar los volúmenes de control con los nuevos gases
            syncMLFRProperties();

            console.log("🔄 Estado de `yamlData.melgen_input.control_volumes` después de añadir gas:", JSON.stringify(yamlData.melgen_input.control_volumes, null, 2));
            console.log("🕵️ Estado de nodos en la red después de actualizar el gas:", JSON.stringify(network.body.data.nodes.get(), null, 2));

            yamlData.melgen_input.control_volumes.forEach((cv, index) => {
                console.log(`CV ${index + 1}:`, JSON.stringify(cv, null, 2));
            });

            // Recargar el modal para reflejar los cambios
            openModal();
        });
    }

    // Guardar cambios en External Data Files
    const saveEDFButton = document.getElementById("save-external-data-files");
    saveEDFButton.addEventListener("click", () => {
        const updatedEDF = yamlData.melgen_input.external_data_files.map((file, index) => {
            const name = document.getElementById(`file-name-${index}`).value;
            const channels = parseInt(document.getElementById(`file-channels-${index}`).value, 10);
            const mode = document.getElementById(`file-mode-${index}`).value;

            const fileSpecification = {
                file_name: document.getElementById(`file-spec-name-${index}`).value,
            };

            const fileFormat = document.getElementById(`file-format-${index}`).value;

            const writeIncrementControl = {
                time_effective: parseFloat(document.getElementById(`write-time-effective-${index}`).value),
                time_increment: parseFloat(document.getElementById(`write-time-increment-${index}`).value),
            };

            const channelVariables = {};
            for (let i = 1; i <= channels; i++) {
                const key = `A${i}`;
                const value = document.getElementById(`channel-var-${index}-${key}`).value;
                channelVariables[key] = value;
            }

            return {
                name,
                channels,
                mode,
                file_specification: fileSpecification,
                file_format: fileFormat,
                write_increment_control: writeIncrementControl,
                channel_variables: channelVariables,
            };
        });

        yamlData.melgen_input.external_data_files = updatedEDF;
        console.log("Datos External Data Files guardados:", yamlData.melgen_input.external_data_files);

        modal.classList.add("hidden");
        modal.style.display = "none";
    });

    // Manejo de eventos para actualizar dinámicamente los campos de channel variables
    yamlData.melgen_input.external_data_files.forEach((file, index) => {
        const channelsInput = document.getElementById(`file-channels-${index}`);
        channelsInput.addEventListener("change", (e) => {
            const channels = parseInt(e.target.value, 10);
            updateChannelVariables(index, channels);
        });

        // Inicializar campos de channel variables
        updateChannelVariables(index, file.channels || 0);
    });

    addCloseEventListener();
};

// Función para cerrar el modal
const closeModal = () => {
    modal.classList.add("hidden");
    modal.style.display = "none"; // Asegurar que se oculte
};

// Función para agregar listener al botón cerrar dentro del modal
const addCloseEventListener = () => {
    const newCloseModalButton = document.getElementById("closeModalBtn");
    newCloseModalButton.addEventListener("click", closeModal);
};

modal.addEventListener("click", (e) => {
    if (e.target === modal) {
        closeModal();
    }
    });

const updateChannelVariables = (index, channels) => {
    const container = document.getElementById(`channel-variables-section-${index}`);
    container.innerHTML = ""; // Limpiar contenido existente

    for (let i = 1; i <= channels; i++) {
        const key = `A${i}`;
        const value = yamlData.melgen_input.external_data_files[index]?.channel_variables?.[key] || "";
        container.innerHTML += `
            <div class="channel-variable-section">
                <label for="channel-var-${index}-${key}">${key}: </label>
                <input type="text" id="channel-var-${index}-${key}" value="${value}" />
            </div>
        `;
    }
};

// Función para crear formulario de edición de ncg_input
const createEditFormNCGInput = (ncgInputs, updateCallback) => {
    const allGases = [
        "N2",
        "O2",
        "H2",
        "HE",
        "AR"
    ];

    const usedNames = ncgInputs.map(ncg => ncg.name);
    const remainingGases = allGases.filter(name => !usedNames.includes(name));

    let formContent = `<h4>Editar NCG</h4>`;

    // Mostrar los gases actuales con opción de eliminar
    ncgInputs.forEach((ncg, index) => {
        formContent += `
            <div class="ncg-section" data-index="${index}">
                <label>ID: </label>
                <input type="text" id="ncg-id-${index}" value="${ncg.id}" readonly />
                <label>Nombre: </label>
                <input type="text" id="ncg-name-${index}" value="${ncg.name}" readonly />
                <button id="delete-ncg-${index}" class="delete-ncg-btn">Eliminar</button>
            </div>
        `;
    });

    // Opción para añadir un gas de los restantes
    if (remainingGases.length > 0) {
        formContent += `
            <div class="add-ncg-section">
                <label>Añadir Gas:</label>
                <select id="add-ncg-select">
                    ${remainingGases
                        .map(name => `<option value="${name}">${name}</option>`)
                        .join("")}
                </select>
                <button id="add-ncg-btn">Añadir</button>
            </div>
        `;
    } else {
        formContent += `<p>Todos los gases disponibles ya están añadidos.</p>`;
    }

    // Botones para guardar o cancelar
    formContent += `
        <button id="saveNCGInput">Guardar</button>
        <button id="cancelEditNCGInput">Cancelar</button>
    `;

    return formContent;
};

const createEditFormExternalDataFiles = (externalDataFiles) => {
    let formContent = `<h4>Editar Archivos de Datos Externos</h4>`;

    externalDataFiles.forEach((file, index) => {
        formContent += `
            <div class="external-file-section">
                <h5>Archivo ${index + 1}: ${file.name}</h5>
                
                <label for="file-name-${index}">Nombre: </label>
                <input type="text" id="file-name-${index}" value="${file.name}" />

                <label for="file-channels-${index}">Canales: </label>
                <input type="number" id="file-channels-${index}" value="${file.channels}" min="1" />

                <label for="file-mode-${index}">Modo: </label>
                <select id="file-mode-${index}">
                    <option value="READ" ${file.mode === "READ" ? "selected" : ""}>READ</option>
                    <option value="WRITE" ${file.mode === "WRITE" ? "selected" : ""}>WRITE</option>
                    <option value="PUSH" ${file.mode === "PUSH" ? "selected" : ""}>PUSH</option>
                </select>
                
                <h5>Especificación del Archivo:</h5>
                <label for="file-spec-name-${index}">Nombre del Archivo: </label>
                <input type="text" id="file-spec-name-${index}" value="${file.file_specification.file_name}" />

                <h5>Formato del Archivo:</h5>
                <label for="file-format-${index}">Formato: </label>
                <input type="text" id="file-format-${index}" value="${file.file_format}" />

                <h5>Control de Incremento de Escritura:</h5>
                <label for="write-time-effective-${index}">Tiempo Efectivo: </label>
                <input type="text" id="write-time-effective-${index}" value="${file.write_increment_control.time_effective}" />

                <label for="write-time-increment-${index}">Incremento de Tiempo: </label>
                <input type="text" id="write-time-increment-${index}" value="${file.write_increment_control.time_increment}" />

                <h5>Variables de Canal:</h5>
                <div id="channel-variables-section-${index}"></div>
            </div>`;
    });

    formContent += `<button id="save-external-data-files">Guardar</button>`;
    return formContent;
};

const createEditFormControlFunction = (id, name, properties, updateCallback) => {
    // Lista de opciones disponibles para el campo "Tipo"
    const typeOptions = [
        "L-EQUALS", "L-NOT", "L-EQV", "L-EQ", "L-GT", "L-GE", "L-NE", "L-AND", "L-OR", 
        "L-L-IFTE", "EQUALS", "ABS", "ADD", "DIM", "MULTIPLY", "DIVIDE", "POWER-I", 
        "POWER-R", "POWER-V", "EXP", "LN", "LOG", "SQRT", "COS", "SIN", "TAN", "ARCCOS", 
        "ARCSIN", "ARCTAN", "COSH", "SINH", "TANH", "MAX", "MIN", "SIGN", "SIGNI", 
        "UNIT-NRM", "TAB-FUN", "L-A-IFTE"
    ];

    let formContent = `<h4>Editar propiedades de la función de control: ${id} - ${name}</h4>`;
    
    // Campo "Tipo" con una lista desplegable
    formContent += `
        <div class="property-section">
            <label>Tipo: </label>
            <select id="edit-type">
                ${typeOptions.map(option => `
                    <option value="${option}" ${option === properties.type ? "selected" : ""}>
                        ${option}
                    </option>
                `).join('')}
            </select>
        </div>
    `;

    // Otros campos principales
    formContent += `
        <div class="property-section">
            <label>Número de argumentos: </label>
            <input type="number" id="edit-num-arguments" value="${properties.num_arguments}" min="0" style="appearance: textfield;" />
        </div>
        <div class="property-section">
            <label>Factor de escala: </label>
            <input type="text" id="edit-scale-factor" value="${properties.scale_factor}" />
        </div>
        <div class="property-section">
            <label>Constante aditiva: </label>
            <input type="text" id="edit-additive-constant" value="${properties.additive_constant}" />
        </div>
    `;

    // Contenedor para los argumentos (se generará dinámicamente)
    formContent += `<div id="arguments-container"></div>`;

    // Botones para guardar y cancelar
    formContent += `
        <button id="saveProperties">Guardar</button>
        <button id="cancelEdit">Cancelar</button>
    `;

    return formContent;
};

const createEditFormControlVolume = (id, name, properties, altitudeVolume, updateCallback) => {
    let formContent = `<h4>Editar propiedades de: ${id} - ${name}</h4>`;
    for (const [key, value] of Object.entries(properties)) {
        formContent += 
            `<div class="property-section">
                <label>${key}: </label>
                <input type="number" id="edit-${key}" value="${value}" />
            </div>`;
    }

    formContent += `<h5>Editar Valores Altitud-Volumen:</h5>`;
    for (const [key, value] of Object.entries(altitudeVolume)) {
        formContent += 
            `<div class="altitude-volume-section">
                <label>(Altitud): </label>
                <input type="text" id="altitude-key-${key}" value="${key}" />
                <label>(Volumen): </label>
                <input type="text" id="altitude-value-${key}" value="${value}" />
            </div>`;
    }

    formContent += 
        `<button id="saveProperties">Guardar</button>
        <button id="cancelEdit">Cancelar</button>`;

    return formContent;
};

const createEditFormFlowPath = (id, name, geometry, segmentParameters, junctionLimits, timeDependentFlowPath) => {
    let formContent = `<h4>Editar propiedades de: ${id} - ${name}</h4>`;

    // Sección para editar la geometría
    formContent += `<h5>Geometría</h5>`;
    for (const [key, value] of Object.entries(geometry)) {
        formContent += 
            `<div class="property-section">
                <label>${key}: </label>
                <input type="text" id="edit-geometry-${key}" value="${value}" />
            </div>`;
    }

    // Sección para editar los parámetros del segmento
    formContent += `<h5>Segment Parameters</h5>`;
    for (const [key, value] of Object.entries(segmentParameters)) {
        formContent += 
            `<div class="property-section">
                <label>${key}: </label>
                <input type="text" id="edit-segment-${key}" value="${value}" />
            </div>`;
    }

    // Sección para editar los límites de la unión
    formContent += `<h5>Junction Limits</h5>`;
    for (const [key, limits] of Object.entries(junctionLimits)) {
        formContent += `<h6>${key.charAt(0).toUpperCase() + key.slice(1)} Volume</h6>`;
        for (const [subKey, value] of Object.entries(limits)) {
            formContent += 
                `<div class="property-section">
                    <label>${subKey.replace(/_/g, ' ')}: </label>
                    <input type="text" id="edit-junction-${key}-${subKey}" value="${value}" />
                </div>`;
        }
    }

    // Sección para editar el flujo dependiente del tiempo
    formContent += `<h5>Time Dependent Flow Path</h5>`;
    for (const [key, value] of Object.entries(timeDependentFlowPath)) {
        formContent += 
            `<div class="property-section">
                <label>${key.replace(/_/g, ' ')}: </label>
                <input type="text" id="edit-time-dependent-${key}" value="${value}" />
            </div>`;
    }

    // Botones para guardar y cancelar
    formContent += 
        `<button id="saveFlowPathProperties">Guardar</button>
        <button id="cancelEditFlowPath">Cancelar</button>`;

    return formContent;
};

otrosDatosButton.addEventListener("click", openModal);

// Asignar el evento de carga de archivo al input
document.getElementById('melcorFileInput').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;

    console.log("Archivo seleccionado:", file.name);

    const formData = new FormData();
    formData.append('file', file);

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        console.log("Respuesta del servidor:", data);

        console.log("Contenido YAML recibido de Python:", data.yaml);

        if (!data.yaml) {
            throw new Error("No se recibió el contenido YAML del servidor.");
        }

        handleFileUpload(data.yaml);
    })
    .catch(error => {
        console.error('Error al subir o procesar el archivo MELCOR:', error);
    });
});

// Hacer que el botón dispare el clic en el input oculto
document.getElementById('loadMelcorBtn').addEventListener('click', function () {
    document.getElementById('melcorFileInput').click();
});

// Asignar evento al botón de "Nuevo Diagrama"
newDiagramBtn.addEventListener('click', createNewDiagram);

// Función para crear un nuevo diagrama desde cero
function createNewDiagram() {
    yamlData = JSON.parse(JSON.stringify(initialYaml)); // Clonar estructura base
    clearGraph(); 

    document.getElementById('propertiesContent').innerHTML = ""; // Limpiar panel de propiedades

    console.log("Nuevo diagrama creado:", yamlData);
    console.log("Estructura YAML inicial:", jsyaml.dump(yamlData));

    initializeGraph(); // Inicializar nuevo grafo vacío
}

// Función para inicializar el lienzo
function initializeGraph() {
    setupDragAndDrop();
    const data = { nodes, edges };
    network = new vis.Network(container, data, options);
    
    setupNetworkListeners();
}

// Configurar eventos de Drag & Drop
function setupDragAndDrop() {
    const controlVolumeElement = document.getElementById("controlVolume");
    const controlFunctionElement = document.getElementById("controlFunction");

    controlVolumeElement.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", "control_volume");
    });

    // Habilitar arrastre para Control Function (CF)
    controlFunctionElement.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", "control_function");
    });

    container.addEventListener("dragover", (event) => event.preventDefault());

    container.addEventListener("drop", (event) => {
        event.preventDefault();
        const nodeType = event.dataTransfer.getData("text/plain");
        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        if (nodeType === "control_volume") {
            openModalToAddNode("Control Volume", x, y);
        } else if (nodeType === "control_function") {
            openModalToAddNode("Control Function", x, y);
        }
    });
}

// Mostrar modal para ingresar nombre del nodo (CV o CF)
function openModalToAddNode(nodeType, x, y) {
    if (modalOpen) {
        return;
    }

    modalOpen = true;

    const modal = document.createElement("div");
    modal.classList.add("modal");
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-btn">&times;</span>
            <h2>Agregar ${nodeType}</h2>
            <label for="nodeName">Nombre:</label>
            <input type="text" id="nodeName" required />
            <button id="addNodeBtn">Agregar</button>
        </div>
    `;
    document.body.appendChild(modal);
    centerModal(modal);

    modal.querySelector(".close-btn").addEventListener("click", () => {
        modal.remove();
        modalOpen = false;
    });

    modal.querySelector("#addNodeBtn").addEventListener("click", () => {
        const name = document.querySelector("#nodeName").value.trim();
        if (name) {
            if (nodeType === "Control Volume") {
                addControlVolume(name, x, y);
            } else if (nodeType === "Control Function") {
                addControlFunction(name, x, y);
            }
            modal.remove();
            modalOpen = false;
        } else {
            alert("Debe ingresar un nombre");
        }
    });
}

function openModalToAddEdge(fromNodeId, toNodeId) {
    if (modalOpen) return;

    modalOpen = true;
    const modal = document.createElement("div");
    modal.classList.add("modal");
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-btn">&times;</span>
            <h2>Agregar Flow Path</h2>
            <label for="flowPathName">Nombre:</label>
            <input type="text" id="flowPathName" required />
            <button id="addFlowPathBtn">Agregar</button>
        </div>
    `;
    document.body.appendChild(modal);
    centerModal(modal);

    modal.querySelector(".close-btn").addEventListener("click", () => {
        modal.remove();
        modalOpen = false;
    });

    modal.querySelector("#addFlowPathBtn").addEventListener("click", () => {
        const name = document.querySelector("#flowPathName").value.trim();
        if (name) {
            addFlowPath(name, fromNodeId, toNodeId);
            modal.remove();
            modalOpen = false;
        } else {
            alert("Debe ingresar un nombre");
        }
    });
}

// Añadir un Control Volume al diagrama
function addControlVolume(name, x, y) {
    if (!network) {
        console.error("Error: network aún no ha sido inicializado.");
        return;
    }
    // Obtener el siguiente ID disponible
    const nextIdNumber = yamlData.melgen_input.control_volumes.length + 1;
    const newId = String(nextIdNumber).padStart(3, '0'); 
    
    const newNode = {
        id: generatePrefixedId("cv", newId),
        label: name,
        shape: "box",
        color: "#D9E2F3",
        properties: {
            PVOL: 0.0,
            TATM: 0.0,
            RHUM: 0.0,
        },
        altitude_volume: {
            "0.0": 0.0,
            "1.0": 1.0
        },
        x: x,
        y: y
    };

    nodes.add(newNode);

    const controlVolume = {
        id: newId,
        name: name,
        type: 2,
        properties: {
            PVOL: 0.0,
            TATM: 0.0,
            RHUM: 0.0,
        },
        altitude_volume: {
            "0.0": 0.0,
            "1.0": 1.0
        }
    };

    yamlData.melgen_input.ncg_input.forEach((gas) => {
        controlVolume.properties[`MLFR.${gas.id}`] = 0.0;
    });

    // Aquí asumimos que ya tienes el objeto `data` donde se guardan los Control Volumes
    yamlData.melgen_input.control_volumes.push(controlVolume);

    console.log("yamlData actualizado:", JSON.stringify(yamlData, null, 2));
}

// Añadir una Control Function al diagrama
function addControlFunction(name, x, y) {
    if (!network) {
        console.error("Error: network aún no ha sido inicializado.");
        return;
    }

    const nextIdNumber = yamlData.melgen_input.control_functions.length + 1;
    const newId = String(nextIdNumber).padStart(3, '0');

    const newNode = {
        id: generatePrefixedId("cf", newId),
        label: name,
        shape: "circle",
        color: "#F5A5D5",
        type: 'control_function', // Asegurar compatibilidad
        properties: {
            type: "EQUALS",
            sinks: [],
            num_arguments: 1,
            scale_factor: 1.0,
            additive_constant: 0.0,
            arguments: [
                {
                    scale_factor: 0.0,
                    additive_constant: 1.0,
                    database_element: "TIME"
                }
            ]
        }
    };

    nodes.add(newNode);

    const controlFunction = {
        id: newId,
        name: name,
        type: "EQUALS",
        sinks: [],
        num_arguments: 1,
        scale_factor: 1.0,
        additive_constant: 0.0,
        arguments: [
            {
                scale_factor: 0.0,
                additive_constant: 1.0,
                database_element: "TIME"
            }
        ]
    };

    yamlData.melgen_input.control_functions.push(controlFunction);
    console.log("yamlData actualizado:", JSON.stringify(yamlData, null, 2));
}

function addFlowPath(name, fromNodeId, toNodeId) {
    const nextIdNumber = yamlData.melgen_input.flow_paths.length + 1;
    const newId = String(nextIdNumber).padStart(3, "0");

    // Crear el edge en el diagrama
    edges.add({
        id: generatePrefixedId("fp", newId),
        from: fromNodeId,
        to: toNodeId,
        label: name,
        type: "flow_path",
        properties: {
            area: 1.0,
            length: 1.0,
            fraction_open: 1.0
        },
        segment_parameters: {
            area: 1.0,
            length: 1.0,
            hydraulic_diameter: 1.0
        },
        junction_limits: {
            from_volume: {
                bottom_opening_elevation: 1.0,
                top_opening_elevation: 1.0
            },
            to_volume: {
                bottom_opening_elevation: 1.0,
                top_opening_elevation: 1.0
            }
        },
        time_dependent_flow_path: {
            type_flag: 2,
            function_number: 1
        }
    });

    // Agregar al YAML
    const flowPath = {
        id: newId,
        name: name,
        from_control_volume: {
            id: fromNodeId.replace("cv_", ""),
            height: 4.25
        },
        to_control_volume: {
            id: toNodeId.replace("cv_", ""),
            height: 4.25
        },
        geometry: {
            area: 1.0,
            length: 1.0,
            fraction_open: 1.0
        },
        segment_parameters: {
            area: 1.0,
            length: 1.0,
            hydraulic_diameter: 1.0
        },
        junction_limits: {
            from_volume: {
                bottom_opening_elevation: 3.75,
                top_opening_elevation: 4.75
            },
            to_volume: {
                bottom_opening_elevation: 3.75,
                top_opening_elevation: 4.75
            }
        },
        time_dependent_flow_path: {
            type_flag: 2,
            function_number: 1
        }
    };

    yamlData.melgen_input.flow_paths.push(flowPath);
    console.log("Flow Path añadido al YAML:", JSON.stringify(yamlData, null, 2));
}

document.getElementById("flowPathBtn").addEventListener("click", () => {
    selectingFlowPath = true;
    selectedNodes = [];
});

function syncMLFRProperties() {
    const currentNCGs = yamlData.melgen_input.ncg_input;

    // Construye el nuevo set de MLFR keys con ID correcto
    const newMLFRKeys = currentNCGs.map(gas => `MLFR.${gas.id}`);

    yamlData.melgen_input.control_volumes.forEach(cv => {
        if (!cv.properties) {
            cv.properties = {};
        }

        // Copia actual de propiedades para referencia
        const oldProps = { ...cv.properties };

        // Eliminar todas las claves MLFR antiguas
        Object.keys(cv.properties).forEach(key => {
            if (key.startsWith("MLFR.")) {
                delete cv.properties[key];
            }
        });

        // Reasignar nuevas claves MLFR con valores antiguos si coinciden por nombre
        currentNCGs.forEach((gas, index) => {
            const oldEntry = Object.entries(oldProps).find(([k, _]) => k.startsWith("MLFR.") && oldProps[k] !== undefined);
            const newKey = `MLFR.${gas.id}`;
            cv.properties[newKey] = oldEntry ? oldEntry[1] : 0.0;
        });
    });
}

deleteButton.addEventListener("click", function (event) {
    const selectedNodes = network.getSelectedNodes();
    const selectedEdges = network.getSelectedEdges();

    if (selectedNodes.length > 0) {
        const nodeId = selectedNodes[0];
        removeElementFromGraph(nodeId, 'node');
    } else if (selectedEdges.length > 0) {
        const edgeId = selectedEdges[0];
        removeElementFromGraph(edgeId, 'edge');
    }
    propertiesContent.innerHTML = "";
});

function removeElementFromGraph(elementId, type) {
    if (type === 'node') {
        // Eliminar nodo del dataset
        nodes.remove({ id: elementId });

        // Extraer el prefijo e ID real
        const [prefix, id] = elementId.split("_");
        
        // Eliminar del YAML
        if (prefix === "cv") {
            yamlData.melgen_input.control_volumes = yamlData.melgen_input.control_volumes.filter(cv => cv.id !== id);
            removeConnectedFlowPaths(id);
        } else if (prefix === "cf") {
            yamlData.melgen_input.control_functions = yamlData.melgen_input.control_functions.filter(cf => cf.id !== id);
        }
    } else if (type === 'edge') {
        // Eliminar arista del dataset
        edges.remove({ id: elementId });

        // Extraer el prefijo e ID real
        const [prefix, id] = elementId.split("_");
        
        // Eliminar del YAML
        if (prefix === "fp") {
            yamlData.melgen_input.flow_paths = yamlData.melgen_input.flow_paths.filter(fp => fp.id !== id);
        }
    }
}

function removeConnectedFlowPaths(controlVolumeId) {
    // Filtrar Flow Paths que están conectados al Control Volume eliminado
    const flowPathsToRemove = yamlData.melgen_input.flow_paths.filter(fp => 
        fp.from_control_volume.id === controlVolumeId || fp.to_control_volume.id === controlVolumeId
    );
    
    // Eliminar Flow Paths del dataset gráfico
    flowPathsToRemove.forEach(fp => {
        const prefixedId = generatePrefixedId("fp", fp.id);
        edges.remove({ id: prefixedId });
    });
    
    // Eliminar Flow Paths del YAML
    yamlData.melgen_input.flow_paths = yamlData.melgen_input.flow_paths.filter(fp => 
        fp.from_control_volume.id !== controlVolumeId && fp.to_control_volume.id !== controlVolumeId
    );
}

// Función para centrar el elemento
function centerModal(modal) {
    modal.style.position = 'absolute';
    modal.style.top = '50%'; // Posición vertical al 50% de la ventana
    modal.style.left = '50%'; // Posición horizontal al 50% de la ventana
    modal.style.transform = 'translate(-50%, -50%)'; // Mueve el elemento hacia el centro
    modal.style.zIndex = 9999; // Asegurarse de que esté por encima de otros elementos
    modal.style.width = '400px';  // Establece el tamaño del modal
    modal.style.padding = '20px'; // Añade espacio alrededor del contenido
    modal.style.backgroundColor = '#fff'; // Fondo blanco para el modal
    modal.style.border = '1px solid #ccc'; // Borde gris
    modal.style.borderRadius = '8px'; // Bordes redondeados
    modal.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)'; // Sombra suave
}

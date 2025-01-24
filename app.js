// Selección de elementos clave
const otrosDatosButton = document.getElementById("otrosDatosBtn");
const modal = document.getElementById("otrosDatosModal");
const closeModalButton = document.getElementById("closeModalBtn");
const modalContent = document.querySelector("#otrosDatosModal .modal-content");
const downloadButton = document.getElementById('downloadBtn');

const initialYaml = {
    title: "Nuevo Diagrama",
    jobid: "",
    melgen_input: {
        ncg_input: [],
        control_volumes: [],
        control_functions: [],
        flow_paths: [],
        external_data_files: []
    },
    melcor_input: {
        warning_level: 0,
        cpu_settings: {
            cpu_left: 0.0,
            cpu_lim: 0.0,
            cymesf: []
        },
        time_settings: {
            tend: 0.0,
            time1: {
                time: 0.0,
                dtmax: 0.0,
                dtmin: 0.0,
                dtedt: 0.0,
                dtplt: 0.0,
                dtrst: 0.0
            }
        }
    },
    debug: []
};

let yamlData = null;

// Función para generar un ID único con prefijo
const generatePrefixedId = (prefix, id) => {
    return `${prefix}_${id}`;
};

// Función para manejar el archivo YAML cargado
function handleFileUpload(event) {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            // Parseamos el archivo YAML cargado
            yamlData = jsyaml.load(e.target.result);

            // Inicialización de nodos y aristas
            const nodes = new vis.DataSet();
            const edges = new vis.DataSet();

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

            // Configuración del grafo
            const container = document.getElementById("network");
            const data = { nodes, edges };
            const options = {};
            const network = new vis.Network(container, data, options);

            // Añadimos la funcionalidad de mostrar información en el modal
            const otrosDatosButton = document.getElementById("otrosDatosBtn");
            const modal = document.getElementById("otrosDatosModal");
            const modalContent = document.querySelector("#otrosDatosModal .modal-content");

            const openModal = () => {
                modal.classList.remove("hidden");
                modal.style.display = "flex";
            
                // Generar formularios para NCG Input y External Data Files
                const ncgInputForm = createEditFormNCGInput(yamlData.melgen_input.ncg_input || []);
                const externalDataFilesForm = createEditFormExternalDataFiles(yamlData.melgen_input.external_data_files || []);
            
                // Renderizar el contenido del modal
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
            
                // Botón para cerrar el modal
                const closeModalButton = document.getElementById("closeModalBtn");
                closeModalButton.addEventListener("click", () => {
                    modal.classList.add("hidden");
                    modal.style.display = "none";
                });
            
                // Guardar cambios en NCG Input
                const saveNCGButton = document.getElementById("saveNCGInput");
                saveNCGButton.addEventListener("click", () => {
                    const updatedNCGInputs = [];
                    document.querySelectorAll(".ncg-section").forEach((section, index) => {
                        const id = parseInt(document.getElementById(`ncg-id-${index}`).value, 10);
                        const name = document.getElementById(`ncg-name-${index}`).value;
                        updatedNCGInputs.push({ id, name });
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
            
                        // Eliminar el gas correspondiente del YAML
                        yamlData.melgen_input.ncg_input.splice(index, 1);
                        console.log(`Gas con ID ${gasIdToRemove} eliminado.`);
            
                        // Actualizar los volúmenes de control: eliminar MLFR.<gasIdToRemove>
                        yamlData.melgen_input.control_volumes.forEach((cv) => {
                            if (cv.properties && cv.properties[`MLFR.${gasIdToRemove}`]) {
                                delete cv.properties[`MLFR.${gasIdToRemove}`];
                            }
                        });
            
                        console.log("Volúmenes de control actualizados tras eliminar gas:", yamlData.melgen_input.control_volumes);
            
                        // Recargar el modal para reflejar los cambios
                        openModal();
                    });
                });
            
                // Botón para añadir un gas
                const addButton = document.getElementById("add-ncg-btn");
                if (addButton) {
                    addButton.addEventListener("click", () => {
                        const selectedGasId = parseInt(document.getElementById("add-ncg-select").value, 10);
                        const selectedGasName = document.getElementById("add-ncg-select").selectedOptions[0].text;
            
                        // Añadir el nuevo gas al YAML
                        yamlData.melgen_input.ncg_input.push({ id: selectedGasId, name: selectedGasName });
                        console.log(`Gas añadido: { id: ${selectedGasId}, name: ${selectedGasName} }`);
            
                        // Actualizar los volúmenes de control: añadir MLFR.<selectedGasId> inicializado a 0.0
                        yamlData.melgen_input.control_volumes.forEach((cv) => {
                            if (!cv.properties) cv.properties = {};
                            if (!cv.properties[`MLFR.${selectedGasId}`]) {
                                cv.properties[`MLFR.${selectedGasId}`] = 0.0;
                            }
                        });
            
                        console.log("Volúmenes de control actualizados tras añadir gas:", yamlData.melgen_input.control_volumes);
            
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
            };

            otrosDatosButton.addEventListener("click", openModal);           

            // Manejo del evento click
            network.on("click", function (event) {
                const { nodes: clickedNodes, edges: clickedEdges } = event;

                if (clickedNodes.length > 0) {
                    const nodeId = clickedNodes[0];
                    const node = nodes.get(nodeId);

                    // Distinción entre nodos de Control Volumes y Control Functions
                    if (nodeId.startsWith("cv")) {
                        console.log("Nodo de Control Volume seleccionado:", nodeId);
                        const editForm = createEditFormControlVolume(nodeId, node.label, node.properties, node.altitude_volume, (newProps, newAltitudeVolume) => {
                            nodes.update({ 
                                id: nodeId, 
                                properties: newProps, 
                                altitude_volume: newAltitudeVolume 
                            });
                        });
    
                        const propertiesContent = document.getElementById('propertiesContent');
                        propertiesContent.innerHTML = editForm;
    
                        document.getElementById("saveProperties").addEventListener("click", () => {
                            const newProps = {};
                            const newAltitudeVolume = {};
                            let mlfrTotal = 0;
                            let mlfrValid = true;
                            let invalidFields = false;
    
                            // Validación de los campos MLFR
                            Object.keys(node.properties).forEach(key => {
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
    
                                    newProps[key] = value; // Actualizar el valor de la propiedad
                                }
                            });
    
                            // Validación de altitude_volume
                            Object.keys(node.altitude_volume).forEach(key => {
                                const keyInput = document.getElementById(`altitude-key-${key}`);
                                const valueInput = document.getElementById(`altitude-value-${key}`);
                                const keyValue = keyInput ? keyInput.value : '';
                                const valueValue = valueInput ? valueInput.value : '';
    
                                if (isNaN(keyValue) || isNaN(valueValue) || keyValue === '' || valueValue === '') {
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
    
                            if (mlfrValid && mlfrTotal === 1.0 && !invalidFields) {
                                nodes.update({ id: nodeId, properties: newProps, altitude_volume: newAltitudeVolume });

                                const controlVolumeId = nodeId.replace(/^\D+/g, ""); // Extraer el ID (sin prefijo 'cv')
                                const controlVolume = yamlData.melgen_input.control_volumes.find(cv => cv.id === controlVolumeId);

                                if (controlVolume) {
                                    // Actualizar únicamente properties y altitude_volume
                                    controlVolume.properties = { ...controlVolume.properties, ...newProps };
                                    controlVolume.altitude_volume = { ...newAltitudeVolume };
                                    
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
                            nodes.update({ id: nodeId, properties: newProps });
                        });

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
                        
                                // Validar Elemento de Base de Datos: solo debe contener caracteres alfabéticos
                                if (!/^[a-zA-Z]+$/.test(databaseElement)) {
                                    alert(`El campo "Elemento de Base de Datos" del argumento ${i + 1} solo puede contener caracteres alfabéticos.`);
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
                                nodes.update({ id: nodeId, properties: newProps });

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
                    const edge = edges.get(edgeId);

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

                                // Verificación: Comprobar que el valor completo sea numérico y mayor que 0
                                if (isNaN(numericValue) || value === '' || numericValue <= 0 || value !== String(numericValue)) {
                                    alert(`El valor de ${key} debe ser un número positivo válido.`);
                                    invalidFields = true;
                                } else {
                                    newProps[key] = numericValue;
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
                            edges.update({
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
            });

        } catch (e) {
            alert('Error al leer el archivo YAML: ' + e.message);
        }
    };

    reader.readAsText(file);
}

// Función para crear formulario de edición de ncg_input
const createEditFormNCGInput = (ncgInputs, updateCallback) => {
    const allGases = [
        { id: 4, name: "N2" },
        { id: 5, name: "O2" },
        { id: 6, name: "H2" },
        { id: 7, name: "HE" },
        { id: 8, name: "AR" }
    ];

    // Filtramos los gases restantes que aún no están en ncgInputs
    const remainingGases = allGases.filter(
        gas => !ncgInputs.some(ncg => ncg.id === gas.id)
    );

    let formContent = `<h4>Editar NCG</h4>`;

    // Mostrar los gases actuales con opción de eliminar
    ncgInputs.forEach((ncg, index) => {
        formContent += `
            <div class="ncg-section">
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
                        .map(
                            gas => `<option value="${gas.id}">${gas.name}</option>`
                        )
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

const createEditFormControlVolume = (id, name, properties, altitudeVolume, updateCallback) => {
    let formContent = `<h4>Editar propiedades de: ${id} - ${name}</h4>`;
    let mlfrTotal = 0; // Para verificar la suma de MLFR

    for (const [key, value] of Object.entries(properties)) {
        // Validación de MLFR
        if (key.startsWith("MLFR")) {
            mlfrTotal += parseFloat(value);
        }

        formContent += 
            `<div class="property-section">
                <label>${key}: </label>
                <input type="number" id="edit-${key}" value="${value}" />
            </div>`;
    }

    // Agregar sección para altitude_volume
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

// Función para abrir el modal
const openModal = () => {
    modal.classList.remove("hidden");
    modal.style.display = "flex"; // Asegurar que se muestre
    modalContent.innerHTML = `
    <span class="close-btn" id="closeModalBtn">&times;</span>
    <h2>Editar Otros Datos</h2>
    <p>Se abre bien, no hay de qué preocuparse.</p>`;
    addCloseEventListener(); // Asegurar que el botón cerrar funcione
};

// Función para cerrar el modal
const closeModal = () => {
    modal.classList.add("hidden");
    modal.style.display = "none"; // Asegurar que se oculte
};

downloadButton.addEventListener('click', () => {
    try {
        // Convertir yamlData a formato YAML
        const yamlContent = jsyaml.dump(yamlData);

        // Crear un archivo Blob con el contenido YAML
        const blob = new Blob([yamlContent], { type: 'application/x-yaml' });

        // Crear un enlace de descarga temporal
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'datos_actualizados.yaml';  // Nombre del archivo descargado

        // Simular clic en el enlace para iniciar la descarga
        link.click();

        // Limpiar el objeto URL
        URL.revokeObjectURL(link.href);
    } catch (error) {
        console.error("Error al generar el archivo YAML:", error);
    }
});

// Función para agregar listener al botón cerrar dentro del modal
const addCloseEventListener = () => {
    const newCloseModalButton = document.getElementById("closeModalBtn");
    newCloseModalButton.addEventListener("click", closeModal);
};

// Listener para el botón "Otros Datos"
otrosDatosButton.addEventListener("click", openModal);

// Listener opcional: cerrar el modal al hacer clic fuera de su contenido
modal.addEventListener("click", (e) => {
if (e.target === modal) {
    closeModal();
}
});
// Hacer que el botón dispare el clic en el input oculto
document.getElementById('loadYamlBtn').addEventListener('click', function () {
    document.getElementById('yamlFileInput').click();
});

// Asignar el evento de carga de archivo al input
document.getElementById('yamlFileInput').addEventListener('change', handleFileUpload);

// Función para limpiar el lienzo
function clearCanvas() {
    const canvas = document.getElementById("diagramCanvas");
    if (canvas) {
        canvas.innerHTML = ""; // Limpia todo el contenido del lienzo
    }
}

// Función para inicializar el YAML
function initializeYaml(yamlData) {
    currentYaml = yamlData;
    console.log("YAML inicializado:", yamlData);
}

// Manejo del evento clic en el botón "Nuevo Diagrama"
document.getElementById("newDiagramBtn").addEventListener("click", () => {
    // Limpia el lienzo
    clearCanvas();

    // Inicializa el YAML con los valores por defecto
    const yamlData = JSON.parse(JSON.stringify(initialYaml));
    initializeYaml(yamlData);

    // Mensaje de confirmación
    console.log("Nuevo diagrama creado");
});

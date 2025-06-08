Este proyecto es una aplicación web interactiva desarrollada como Trabajo de Fin 
de Grado que permite la visualización, edición y creación de modelos MELCOR a través de una
interfaz gráfica. La finalidad de este proyecto es facilitar la creación de modelos MELCOR
a partir de una interfaz intuitiva que permita declarar y modificar volúmenes de control, funciones
de control y flow paths.

Para poder ejecutarlo es necesario seguir los siguientes pasos:
1. Tener instalado Python 3.10 o superior. 
2. Tener instalado la libreria Flask para servidores web. Puedes instalarla con el siguiente comando:
pip install Flask.
3. Ejecutar el archivo principal:
python app.py
4. Abrir el navegador y acceder a http://localhost:5000 para empezar a utilizarla.

Para poder utilizarlo, carga tus modelos MELCOR o crea uno desde cero. Se visualizaran los modelos y
a través de la interfaz podrás modicar todo lo que necesites.

Los ficheros incluidos son:
app.py: servidor principal de Flask que incluye el parser de la aplicación.
index.html: página principal de la aplicación.
style.css: fichero con las reglas css para implementar la estética de la aplicación.
prueba.js: fichero que incluye las funcionalidades de la página.

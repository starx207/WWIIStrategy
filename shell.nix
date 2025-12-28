{
  pkgs ? import <nixpkgs> { },
  ...
}:
pkgs.mkShell {
  nativeBuildInputs = with pkgs; [
    nodejs_22
    nodePackages."@angular/cli"
  ];

  shellHook = ''
    if [ ! -d "node_modules" ]; then
      echo "Installing dependencies..."
      npm install
    fi
  '';
}

{
  pkgs ? import <nixpkgs> { },
  ...
}:
pkgs.mkShell {
  nativeBuildInputs = with pkgs; [
    nodejs_22
    (python3.withPackages (python-pkgs: with python-pkgs; [
      numpy
      pillow
    ]))
  ];

  shellHook = ''
    cp hooks/pre-commit .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit
  '';
}

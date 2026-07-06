class Point:

    # Representa um ponto geográfico
    def __init__(self, lat, lon, data=None):
        self.lat = lat
        self.lon = lon
        self.data = data

    def __repr__(self):
        return f"Point(lat={self.lat}, lon={self.lon})"


class Rectangle:
    """
    Retângulo utilizado como limite espacial

    x = longitude central
    y = latitude central

    w = metade da largura
    h = metade da altura
    """

    def __init__(self, x, y, w, h):
        self.x = x
        self.y = y
        self.w = w
        self.h = h

    def contains(self, point):

        return (
            self.x - self.w <= point.lon <= self.x + self.w
            and
            self.y - self.h <= point.lat <= self.y + self.h
        )

    def intersects(self, other):

        return not (
            other.x - other.w > self.x + self.w
            or other.x + other.w < self.x - self.w
            or other.y - other.h > self.y + self.h
            or other.y + other.h < self.y - self.h
        )

    def __repr__(self):

        return (
            f"Rectangle("
            f"x={self.x}, "
            f"y={self.y}, "
            f"w={self.w}, "
            f"h={self.h})"
        )


class QuadTree:

    def __init__(self, boundary, capacity=8):

        self.boundary = boundary
        self.capacity = capacity

        self.points = []

        self.divided = False

        self.northeast = None
        self.northwest = None
        self.southeast = None
        self.southwest = None

    # Subdivisão
    def subdivide(self):

        x = self.boundary.x
        y = self.boundary.y

        w = self.boundary.w / 2
        h = self.boundary.h / 2

        northeast = Rectangle(
            x + w,
            y + h,
            w,
            h
        )

        northwest = Rectangle(
            x - w,
            y + h,
            w,
            h
        )

        southeast = Rectangle(
            x + w,
            y - h,
            w,
            h
        )

        southwest = Rectangle(
            x - w,
            y - h,
            w,
            h
        )

        self.northeast = QuadTree(
            northeast,
            self.capacity
        )

        self.northwest = QuadTree(
            northwest,
            self.capacity
        )

        self.southeast = QuadTree(
            southeast,
            self.capacity
        )

        self.southwest = QuadTree(
            southwest,
            self.capacity
        )

        self.divided = True

    # Inserção
    def insert(self, point):

        if not self.boundary.contains(point):
            return False

        if len(self.points) < self.capacity:

            self.points.append(point)
            return True

        if not self.divided:
            self.subdivide()

        return (
            self.northeast.insert(point)
            or self.northwest.insert(point)
            or self.southeast.insert(point)
            or self.southwest.insert(point)
        )

    # Consulta espacial
    def query(self, area, found=None):

        if found is None:
            found = []

        if not self.boundary.intersects(area):
            return found

        for point in self.points:

            if area.contains(point):
                found.append(point)

        if self.divided:

            self.northwest.query(area, found)
            self.northeast.query(area, found)
            self.southwest.query(area, found)
            self.southeast.query(area, found)

        return found
    
    # Contagem total de pontos
    def count_points(self):

        total = len(self.points)

        if self.divided:

            total += self.northeast.count_points()
            total += self.northwest.count_points()
            total += self.southeast.count_points()
            total += self.southwest.count_points()

        return total

    # Profundidade máxima
    def depth(self):

        if not self.divided:
            return 1

        return 1 + max(
            self.northeast.depth(),
            self.northwest.depth(),
            self.southeast.depth(),
            self.southwest.depth()
        )
    
    # Todos os pontos
    def get_all_points(self, result=None):

        if result is None:
            result = []

        result.extend(self.points)

        if self.divided:

            self.northeast.get_all_points(result)
            self.northwest.get_all_points(result)
            self.southeast.get_all_points(result)
            self.southwest.get_all_points(result)

        return result

    # Estatísticas da árvore
    def statistics(self):

        return {
            "total_points": self.count_points(),
            "depth": self.depth(),
            "capacity": self.capacity
        }

    # Representação textual
    def __repr__(self):

        return (
            f"QuadTree("
            f"points={len(self.points)}, "
            f"divided={self.divided})"
        )

# Teste rápido
if __name__ == "__main__":

    boundary = Rectangle(
        x=0,
        y=0,
        w=180,
        h=90
    )

    qt = QuadTree(
        boundary,
        capacity=4
    )

    qt.insert(
        Point(
            lat=-22.01,
            lon=-47.89,
            data={"cidade": "São Carlos"}
        )
    )

    qt.insert(
        Point(
            lat=-21.79,
            lon=-48.17,
            data={"cidade": "Araraquara"}
        )
    )

    area = Rectangle(
        x=-48,
        y=-22,
        w=2,
        h=2
    )

    result = qt.query(area)

    print("Resultados:")
    print(result)

    print()

    print("Estatísticas:")
    print(qt.statistics())